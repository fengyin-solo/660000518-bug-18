package com.codeinterview.controller;

import com.codeinterview.config.ApiException;
import com.codeinterview.dto.InviteCandidateRequest;
import com.codeinterview.dto.WebSocketMessage;
import com.codeinterview.model.CandidateInvitation;
import com.codeinterview.model.InterviewRoom;
import com.codeinterview.repository.CandidateInvitationRepository;
import com.codeinterview.repository.InterviewRoomRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/invitations")
@CrossOrigin(origins = "*")
public class CandidateInvitationController {

    @Autowired
    private CandidateInvitationRepository invitationRepository;

    @Autowired
    private InterviewRoomRepository roomRepository;

    @Autowired
    private SimpMessagingTemplate messagingTemplate;

    @PostMapping
    public ResponseEntity<Map<String, Object>> createInvitation(@RequestBody InviteCandidateRequest request) {
        if (request.getCandidateName() == null || request.getCandidateName().trim().isEmpty()) {
            throw ApiException.badRequest("候选人姓名不能为空");
        }
        if (request.getCandidateEmail() == null || request.getCandidateEmail().trim().isEmpty()) {
            throw ApiException.badRequest("候选人邮箱不能为空");
        }

        InterviewRoom room = roomRepository.findById(request.getRoomId())
                .orElseThrow(() -> ApiException.notFound("房间不存在"));

        if ("COMPLETED".equals(room.getStatus()) || "CANCELLED".equals(room.getStatus())) {
            throw ApiException.badRequest("面试房间已结束，无法发送邀请");
        }

        String email = request.getCandidateEmail().trim();
        invitationRepository
                .findFirstByRoomIdAndCandidateEmailIgnoreCaseAndStatusOrderByCreatedAtDesc(
                        request.getRoomId(), email, "PENDING")
                .ifPresent(existing -> {
                    throw ApiException.conflict("该候选人已有一封待接受的邀请，请直接复制邀请链接或先撤销后重发");
                });

        String inviteToken = UUID.randomUUID().toString();

        CandidateInvitation invitation = new CandidateInvitation();
        invitation.setRoomId(request.getRoomId());
        invitation.setCandidateName(request.getCandidateName().trim());
        invitation.setCandidateEmail(email);
        invitation.setInviteToken(inviteToken);
        invitation.setStatus("PENDING");
        invitation.setCreatedAt(LocalDateTime.now());

        invitation = invitationRepository.save(invitation);
        broadcastInvitations(request.getRoomId());

        return new ResponseEntity<>(toResponse(invitation), HttpStatus.CREATED);
    }

    @GetMapping("/room/{roomId}")
    public List<CandidateInvitation> getInvitationsByRoomId(@PathVariable String roomId) {
        return invitationRepository.findByRoomIdOrderByCreatedAtDesc(roomId);
    }

    @GetMapping("/{invitationId}")
    public CandidateInvitation getInvitationById(@PathVariable String invitationId) {
        return invitationRepository.findById(invitationId)
                .orElseThrow(() -> ApiException.notFound("邀请不存在"));
    }

    @PutMapping("/{invitationId}/status")
    public CandidateInvitation updateInvitationStatus(
            @PathVariable String invitationId,
            @RequestParam String status) {

        CandidateInvitation invitation = invitationRepository.findById(invitationId)
                .orElseThrow(() -> ApiException.notFound("邀请不存在"));

        if (!List.of("PENDING", "ACCEPTED", "DECLINED", "JOINED", "LEFT", "REVOKED").contains(status)) {
            throw ApiException.badRequest("无效的状态值");
        }

        invitation.setStatus(status);

        if ("JOINED".equals(status)) {
            invitation.setJoinedAt(LocalDateTime.now());
        } else if ("REVOKED".equals(status)) {
            invitation.setRevokedAt(LocalDateTime.now());
        }

        invitation = invitationRepository.save(invitation);
        broadcastInvitations(invitation.getRoomId());
        return invitation;
    }

    @GetMapping("/token/{inviteToken}")
    public CandidateInvitation getInvitationByToken(@PathVariable String inviteToken) {
        return invitationRepository.findByInviteToken(inviteToken)
                .orElseThrow(() -> ApiException.notFound("邀请链接无效或不存在"));
    }

    @PostMapping("/{invitationId}/resend")
    public ResponseEntity<Map<String, Object>> resendInvitation(@PathVariable String invitationId) {
        CandidateInvitation invitation = invitationRepository.findById(invitationId)
                .orElseThrow(() -> ApiException.notFound("邀请不存在"));

        if ("PENDING".equals(invitation.getStatus())) {
            throw ApiException.conflict("邀请仍处于待接受状态，无需重新发送");
        }
        if ("JOINED".equals(invitation.getStatus())) {
            throw ApiException.conflict("候选人已加入房间，无法重新发送");
        }

        InterviewRoom room = roomRepository.findById(invitation.getRoomId())
                .orElseThrow(() -> ApiException.notFound("房间不存在"));
        if ("COMPLETED".equals(room.getStatus()) || "CANCELLED".equals(room.getStatus())) {
            throw ApiException.badRequest("面试房间已结束，无法重新发送邀请");
        }

        invitation.setInviteToken(UUID.randomUUID().toString());
        invitation.setStatus("PENDING");
        invitation.setJoinedAt(null);
        invitation.setRevokedAt(null);
        invitation.setParticipantId(null);
        invitation.setCreatedAt(LocalDateTime.now());

        invitation = invitationRepository.save(invitation);
        broadcastInvitations(invitation.getRoomId());

        return new ResponseEntity<>(toResponse(invitation), HttpStatus.OK);
    }

    @DeleteMapping("/{invitationId}")
    public CandidateInvitation revokeInvitation(@PathVariable String invitationId) {
        CandidateInvitation invitation = invitationRepository.findById(invitationId)
                .orElseThrow(() -> ApiException.notFound("邀请不存在"));

        if (!"PENDING".equals(invitation.getStatus())) {
            throw ApiException.badRequest("只有待接受的邀请可以撤销");
        }

        invitation.setStatus("REVOKED");
        invitation.setRevokedAt(LocalDateTime.now());
        invitation = invitationRepository.save(invitation);
        broadcastInvitations(invitation.getRoomId());
        return invitation;
    }

    private void broadcastInvitations(String roomId) {
        List<CandidateInvitation> invitations = invitationRepository.findByRoomIdOrderByCreatedAtDesc(roomId);
        messagingTemplate.convertAndSend("/topic/room/" + roomId + "/invitations",
                new WebSocketMessage<>("INVITATIONS_UPDATE", invitations));
    }

    private Map<String, Object> toResponse(CandidateInvitation invitation) {
        Map<String, Object> response = new HashMap<>();
        response.put("id", invitation.getId());
        response.put("roomId", invitation.getRoomId());
        response.put("candidateName", invitation.getCandidateName());
        response.put("candidateEmail", invitation.getCandidateEmail());
        response.put("inviteToken", invitation.getInviteToken());
        response.put("status", invitation.getStatus());
        response.put("participantId", invitation.getParticipantId());
        response.put("joinedAt", invitation.getJoinedAt());
        response.put("revokedAt", invitation.getRevokedAt());
        response.put("createdAt", invitation.getCreatedAt());
        response.put("inviteLink", "/join?token=" + invitation.getInviteToken());
        return response;
    }
}
