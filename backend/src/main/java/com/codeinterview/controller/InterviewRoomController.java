package com.codeinterview.controller;

import com.codeinterview.config.ApiException;
import com.codeinterview.dto.CreateRoomResponse;
import com.codeinterview.dto.JoinRoomResponse;
import com.codeinterview.dto.WebSocketMessage;
import com.codeinterview.model.CandidateInvitation;
import com.codeinterview.model.InterviewRoom;
import com.codeinterview.model.ParticipantStatus;
import com.codeinterview.repository.CandidateInvitationRepository;
import com.codeinterview.repository.InterviewRoomRepository;
import com.codeinterview.repository.ParticipantStatusRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Random;

@RestController
@RequestMapping("/api/interview-rooms")
@CrossOrigin(origins = "*")
public class InterviewRoomController {

    @Autowired
    private InterviewRoomRepository interviewRoomRepository;

    @Autowired
    private CandidateInvitationRepository candidateInvitationRepository;

    @Autowired
    private ParticipantStatusRepository participantStatusRepository;

    @Autowired
    private SimpMessagingTemplate messagingTemplate;

    private static final String ROOM_CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    private static final int ROOM_CODE_LENGTH = 6;

    @PostMapping
    @Transactional
    public ResponseEntity<CreateRoomResponse> createInterviewRoom(@RequestBody Map<String, String> request) {
        String title = request.get("title");
        String problemId = request.get("problemId");
        String interviewerId = request.get("interviewerId");
        String interviewerName = request.get("interviewerName");

        InterviewRoom room = new InterviewRoom();
        room.setTitle(title);
        room.setProblemId(problemId);
        room.setInterviewerId(interviewerId);
        room.setStatus("WAITING");
        room.setRoomCode(generateUniqueRoomCode());
        room.setCreatedAt(LocalDateTime.now());

        InterviewRoom savedRoom = interviewRoomRepository.save(room);

        ParticipantStatus interviewerStatus = new ParticipantStatus();
        interviewerStatus.setRoomId(savedRoom.getId());
        interviewerStatus.setUserId(interviewerId);
        interviewerStatus.setUserName(interviewerName);
        interviewerStatus.setUserRole("INTERVIEWER");
        interviewerStatus.setOnline(true);
        interviewerStatus.setLastHeartbeat(LocalDateTime.now());
        interviewerStatus.setJoinedAt(LocalDateTime.now());
        ParticipantStatus savedInterviewerStatus = participantStatusRepository.save(interviewerStatus);

        return new ResponseEntity<>(new CreateRoomResponse(savedRoom, savedInterviewerStatus), HttpStatus.CREATED);
    }

    @GetMapping("/{roomId}")
    public ResponseEntity<InterviewRoom> getInterviewRoomById(@PathVariable String roomId) {
        Optional<InterviewRoom> room = interviewRoomRepository.findById(roomId);
        return room.map(ResponseEntity::ok)
                .orElseGet(() -> new ResponseEntity<>(HttpStatus.NOT_FOUND));
    }

    @GetMapping("/code/{roomCode}")
    public ResponseEntity<InterviewRoom> getInterviewRoomByCode(@PathVariable String roomCode) {
        Optional<InterviewRoom> room = interviewRoomRepository.findByRoomCode(roomCode);
        return room.map(ResponseEntity::ok)
                .orElseGet(() -> new ResponseEntity<>(HttpStatus.NOT_FOUND));
    }

    @GetMapping("/interviewer/{interviewerId}")
    public ResponseEntity<List<InterviewRoom>> getInterviewRoomsByInterviewer(@PathVariable String interviewerId) {
        List<InterviewRoom> rooms = interviewRoomRepository.findByInterviewerIdOrderByCreatedAtDesc(interviewerId);
        return new ResponseEntity<>(rooms, HttpStatus.OK);
    }

    @PutMapping("/{roomId}/status")
    @Transactional
    public ResponseEntity<InterviewRoom> updateRoomStatus(@PathVariable String roomId, @RequestBody Map<String, String> request) {
        String status = request.get("status");
        Optional<InterviewRoom> roomOpt = interviewRoomRepository.findById(roomId);

        if (roomOpt.isEmpty()) {
            return new ResponseEntity<>(HttpStatus.NOT_FOUND);
        }

        InterviewRoom room = roomOpt.get();
        room.setStatus(status);

        if ("ACTIVE".equals(status) && room.getStartedAt() == null) {
            room.setStartedAt(LocalDateTime.now());
        } else if (("COMPLETED".equals(status) || "CANCELLED".equals(status)) && room.getEndedAt() == null) {
            room.setEndedAt(LocalDateTime.now());
        }

        InterviewRoom updatedRoom = interviewRoomRepository.save(room);
        return new ResponseEntity<>(updatedRoom, HttpStatus.OK);
    }

    @GetMapping("/{roomId}/participants")
    public ResponseEntity<List<ParticipantStatus>> getRoomParticipants(@PathVariable String roomId) {
        List<ParticipantStatus> participants = participantStatusRepository.findByRoomId(roomId);
        return new ResponseEntity<>(participants, HttpStatus.OK);
    }

    @PostMapping("/{roomId}/join")
    @Transactional
    public ResponseEntity<JoinRoomResponse> joinRoom(@PathVariable String roomId, @RequestBody Map<String, String> request) {
        String candidateName = request.get("candidateName");
        String inviteToken = request.get("inviteToken");

        if (candidateName == null || candidateName.trim().isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "候选人姓名不能为空");
        }

        Optional<InterviewRoom> roomOpt = interviewRoomRepository.findById(roomId);
        if (roomOpt.isEmpty()) {
            throw new ApiException(HttpStatus.NOT_FOUND, "房间不存在");
        }
        InterviewRoom room = roomOpt.get();

        if ("COMPLETED".equals(room.getStatus()) || "CANCELLED".equals(room.getStatus())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "面试房间已"
                    + ("CANCELLED".equals(room.getStatus()) ? "取消" : "结束") + "，无法加入");
        }

        String message = "Joined via room code";
        CandidateInvitation invitation = null;

        if (inviteToken != null && !inviteToken.trim().isEmpty()) {
            Optional<CandidateInvitation> invitationOpt = candidateInvitationRepository.findByInviteToken(inviteToken.trim());
            if (invitationOpt.isEmpty()) {
                throw new ApiException(HttpStatus.UNAUTHORIZED, "邀请链接无效或不存在");
            }

            invitation = invitationOpt.get();
            if (!invitation.getRoomId().equals(roomId)) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "邀请链接与房间不匹配");
            }
            if ("REVOKED".equals(invitation.getStatus())) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "邀请已被撤销，请联系面试官重新发送");
            }

            // 已加入过的候选人刷新页面后重入：复用原有参会身份，保持幂等
            if ("JOINED".equals(invitation.getStatus()) && invitation.getParticipantId() != null) {
                Optional<ParticipantStatus> existing =
                        participantStatusRepository.findByRoomIdAndUserId(roomId, invitation.getParticipantId());
                if (existing.isPresent()) {
                    ParticipantStatus status = existing.get();
                    status.setOnline(true);
                    status.setLastHeartbeat(LocalDateTime.now());
                    participantStatusRepository.save(status);

                    List<ParticipantStatus> participants = participantStatusRepository.findByRoomId(roomId);
                    messagingTemplate.convertAndSend("/topic/room/" + roomId + "/participants",
                            new WebSocketMessage<>("PARTICIPANTS_UPDATE", participants));

                    return new ResponseEntity<>(new JoinRoomResponse(status, room, "Rejoined via invitation token"), HttpStatus.OK);
                }
            }
            message = "Joined via invitation token";
        }

        ParticipantStatus candidateStatus = new ParticipantStatus();
        String participantId = java.util.UUID.randomUUID().toString();
        candidateStatus.setId(participantId);
        candidateStatus.setUserId(participantId);
        candidateStatus.setRoomId(roomId);
        candidateStatus.setUserName(candidateName.trim());
        candidateStatus.setUserRole("CANDIDATE");
        candidateStatus.setOnline(true);
        candidateStatus.setLastHeartbeat(LocalDateTime.now());
        candidateStatus.setJoinedAt(LocalDateTime.now());
        ParticipantStatus savedStatus = participantStatusRepository.save(candidateStatus);

        if (invitation != null) {
            invitation.setStatus("JOINED");
            invitation.setJoinedAt(LocalDateTime.now());
            invitation.setParticipantId(savedStatus.getUserId());
            candidateInvitationRepository.save(invitation);

            messagingTemplate.convertAndSend("/topic/room/" + roomId + "/invitations",
                    new WebSocketMessage<>("INVITATIONS_UPDATE",
                            candidateInvitationRepository.findByRoomIdOrderByCreatedAtDesc(roomId)));
        }

        List<ParticipantStatus> participants = participantStatusRepository.findByRoomId(roomId);
        messagingTemplate.convertAndSend("/topic/room/" + roomId + "/participants",
                new WebSocketMessage<>("PARTICIPANTS_UPDATE", participants));

        JoinRoomResponse response = new JoinRoomResponse(savedStatus, room, message);
        return new ResponseEntity<>(response, HttpStatus.OK);
    }

    @PostMapping("/{roomId}/leave")
    @Transactional
    public ResponseEntity<Void> leaveRoom(@PathVariable String roomId, @RequestBody Map<String, String> request) {
        String userId = request.get("userId");

        Optional<ParticipantStatus> statusOpt = participantStatusRepository.findByRoomIdAndUserId(roomId, userId);
        if (statusOpt.isEmpty()) {
            return new ResponseEntity<>(HttpStatus.NOT_FOUND);
        }

        ParticipantStatus status = statusOpt.get();
        status.setOnline(false);
        participantStatusRepository.save(status);

        List<ParticipantStatus> participants = participantStatusRepository.findByRoomId(roomId);
        messagingTemplate.convertAndSend("/topic/room/" + roomId + "/participants",
                new WebSocketMessage<>("PARTICIPANTS_UPDATE", participants));

        return new ResponseEntity<>(HttpStatus.OK);
    }

    @PostMapping("/{roomId}/heartbeat")
    @Transactional
    public ResponseEntity<ParticipantStatus> heartbeat(@PathVariable String roomId, @RequestBody Map<String, String> request) {
        String userId = request.get("userId");

        Optional<ParticipantStatus> statusOpt = participantStatusRepository.findByRoomIdAndUserId(roomId, userId);
        if (statusOpt.isEmpty()) {
            return new ResponseEntity<>(HttpStatus.NOT_FOUND);
        }

        ParticipantStatus status = statusOpt.get();
        status.setOnline(true);
        status.setLastHeartbeat(LocalDateTime.now());
        ParticipantStatus updatedStatus = participantStatusRepository.save(status);

        List<ParticipantStatus> participants = participantStatusRepository.findByRoomId(roomId);
        messagingTemplate.convertAndSend("/topic/room/" + roomId + "/participants",
                new WebSocketMessage<>("PARTICIPANTS_UPDATE", participants));

        return new ResponseEntity<>(updatedStatus, HttpStatus.OK);
    }

    private String generateUniqueRoomCode() {
        Random random = new Random();
        String code;
        do {
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < ROOM_CODE_LENGTH; i++) {
                sb.append(ROOM_CODE_CHARS.charAt(random.nextInt(ROOM_CODE_CHARS.length())));
            }
            code = sb.toString();
        } while (interviewRoomRepository.existsByRoomCode(code));
        return code;
    }
}
