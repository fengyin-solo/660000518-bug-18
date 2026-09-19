package com.codeinterview.controller;

import com.codeinterview.dto.InvitationResponse;
import com.codeinterview.dto.InviteCandidateRequest;
import com.codeinterview.dto.WebSocketMessage;
import com.codeinterview.exception.NotFoundException;
import com.codeinterview.model.CandidateInvitation;
import com.codeinterview.model.InterviewRoom;
import com.codeinterview.repository.CandidateInvitationRepository;
import com.codeinterview.repository.InterviewRoomRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@RestController
@RequestMapping("/api/invitations")
@CrossOrigin(origins = "*")
public class CandidateInvitationController {

    private static final List<String> VALID_STATUSES =
            List.of("PENDING", "ACCEPTED", "DECLINED", "JOINED", "LEFT", "REVOKED");

    @Autowired
    private CandidateInvitationRepository invitationRepository;

    @Autowired
    private InterviewRoomRepository roomRepository;

    @Autowired
    private SimpMessagingTemplate messagingTemplate;

    /**
     * 生成邀请凭证。
     * 重复发送规则：同一房间、同一邮箱
     *  - 已存在 PENDING 邀请：不重新生成凭证，直接返回原凭证（resent=true）
     *  - 最近一条已 JOINED：拒绝，提示候选人已加入
     *  - 最近一条为 REVOKED/DECLINED/LEFT：允许重新发，生成新凭证
     */
    @PostMapping
    @Transactional
    public InvitationResponse createInvitation(@RequestBody InviteCandidateRequest request) {
        if (request.getRoomId() == null || request.getRoomId().isBlank()) {
            throw new IllegalArgumentException("房间ID不能为空");
        }
        if (request.getCandidateName() == null || request.getCandidateName().isBlank()) {
            throw new IllegalArgumentException("候选人姓名不能为空");
        }
        if (request.getCandidateEmail() == null || request.getCandidateEmail().isBlank()) {
            throw new IllegalArgumentException("候选人邮箱不能为空");
        }
        String email = request.getCandidateEmail().trim();
        if (!email.matches("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$")) {
            throw new IllegalArgumentException("邮箱格式不正确");
        }

        InterviewRoom room = roomRepository.findById(request.getRoomId())
                .orElseThrow(() -> new NotFoundException("房间不存在"));

        if (!"WAITING".equals(room.getStatus())) {
            throw new IllegalArgumentException("房间状态不是 WAITING，无法发送邀请");
        }

        Optional<CandidateInvitation> latestOpt =
                invitationRepository.findFirstByRoomIdAndCandidateEmailIgnoreCaseOrderByCreatedAtDesc(
                        request.getRoomId(), email);

        if (latestOpt.isPresent()) {
            CandidateInvitation latest = latestOpt.get();
            if ("PENDING".equals(latest.getStatus())) {
                return InvitationResponse.of(latest, "", true);
            }
            if ("JOINED".equals(latest.getStatus())) {
                throw new IllegalArgumentException("该候选人已加入房间，无需重复发送邀请");
            }
        }

        CandidateInvitation invitation = new CandidateInvitation();
        invitation.setRoomId(request.getRoomId());
        invitation.setCandidateName(request.getCandidateName().trim());
        invitation.setCandidateEmail(email);
        invitation.setInviteToken(UUID.randomUUID().toString());
        invitation.setStatus("PENDING");
        invitation.setCreatedAt(LocalDateTime.now());
        invitation = invitationRepository.save(invitation);

        broadcastInvitations(invitation.getRoomId());
        return InvitationResponse.of(invitation, "", false);
    }

    @GetMapping("/room/{roomId}")
    public List<CandidateInvitation> getInvitationsByRoomId(@PathVariable String roomId) {
        return invitationRepository.findByRoomIdOrderByCreatedAtDesc(roomId);
    }

    @GetMapping("/{invitationId}")
    public CandidateInvitation getInvitationById(@PathVariable String invitationId) {
        return invitationRepository.findById(invitationId)
                .orElseThrow(() -> new NotFoundException("邀请不存在"));
    }

    @PutMapping("/{invitationId}/status")
    @Transactional
    public CandidateInvitation updateInvitationStatus(
            @PathVariable String invitationId,
            @RequestParam String status) {

        if (!VALID_STATUSES.contains(status)) {
            throw new IllegalArgumentException("无效的状态值: " + status);
        }

        CandidateInvitation invitation = invitationRepository.findById(invitationId)
                .orElseThrow(() -> new NotFoundException("邀请不存在"));

        invitation.setStatus(status);
        if ("JOINED".equals(status)) {
            invitation.setJoinedAt(LocalDateTime.now());
        }
        if ("REVOKED".equals(status)) {
            invitation.setRevokedAt(LocalDateTime.now());
        }

        invitation = invitationRepository.save(invitation);
        broadcastInvitations(invitation.getRoomId());
        return invitation;
    }

    /**
     * 候选人凭 token 查询邀请（加入页预填信息用）。
     * 同时校验凭证当前是否仍可用，撤销/已拒绝的凭证明确报错。
     */
    @GetMapping("/token/{inviteToken}")
    public CandidateInvitation getInvitationByToken(@PathVariable String inviteToken) {
        CandidateInvitation invitation = invitationRepository.findByInviteToken(inviteToken)
                .orElseThrow(() -> new NotFoundException("无效的邀请链接"));

        if ("REVOKED".equals(invitation.getStatus())) {
            throw new IllegalArgumentException("邀请已被撤销，请联系面试官重新发送");
        }
        if ("DECLINED".equals(invitation.getStatus())) {
            throw new IllegalArgumentException("邀请已被拒绝");
        }
        return invitation;
    }

    /**
     * 撤销邀请：软撤销（标记 REVOKED、保留记录），而不是物理删除。
     * 只有 PENDING 状态可以撤销。
     */
    @DeleteMapping("/{invitationId}")
    @Transactional
    public CandidateInvitation revokeInvitation(@PathVariable String invitationId) {
        CandidateInvitation invitation = invitationRepository.findById(invitationId)
                .orElseThrow(() -> new NotFoundException("邀请不存在"));

        if (!"PENDING".equals(invitation.getStatus())) {
            throw new IllegalArgumentException("只有待接受(PENDING)的邀请可以撤销，当前状态: "
                    + invitation.getStatus());
        }

        invitation.setStatus("REVOKED");
        invitation.setRevokedAt(LocalDateTime.now());
        invitation = invitationRepository.save(invitation);

        broadcastInvitations(invitation.getRoomId());
        return invitation;
    }

    private void broadcastInvitations(String roomId) {
        List<CandidateInvitation> all = invitationRepository.findByRoomIdOrderByCreatedAtDesc(roomId);
        messagingTemplate.convertAndSend("/topic/room/" + roomId + "/invitations",
                new WebSocketMessage<>("INVITATIONS_UPDATE", all));
    }
}
