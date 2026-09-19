package com.codeinterview.dto;

import com.codeinterview.model.CandidateInvitation;

import java.time.LocalDateTime;

/**
 * 邀请相关接口的统一响应：除邀请本身字段外，带上可直接打开的邀请链接，
 * 以及 resent 标记（true 表示本次是对已有 PENDING 邀请的重复发送，凭证未重新生成）。
 */
public class InvitationResponse {
    private String id;
    private String roomId;
    private String candidateName;
    private String candidateEmail;
    private String inviteToken;
    private String status;
    private LocalDateTime joinedAt;
    private LocalDateTime revokedAt;
    private LocalDateTime createdAt;
    private String inviteLink;
    private boolean resent;

    public static InvitationResponse of(CandidateInvitation invitation, String baseUrl, boolean resent) {
        InvitationResponse r = new InvitationResponse();
        r.id = invitation.getId();
        r.roomId = invitation.getRoomId();
        r.candidateName = invitation.getCandidateName();
        r.candidateEmail = invitation.getCandidateEmail();
        r.inviteToken = invitation.getInviteToken();
        r.status = invitation.getStatus();
        r.joinedAt = invitation.getJoinedAt();
        r.revokedAt = invitation.getRevokedAt();
        r.createdAt = invitation.getCreatedAt();
        r.inviteLink = baseUrl + "/join?token=" + invitation.getInviteToken();
        r.resent = resent;
        return r;
    }

    public String getId() { return id; }
    public String getRoomId() { return roomId; }
    public String getCandidateName() { return candidateName; }
    public String getCandidateEmail() { return candidateEmail; }
    public String getInviteToken() { return inviteToken; }
    public String getStatus() { return status; }
    public LocalDateTime getJoinedAt() { return joinedAt; }
    public LocalDateTime getRevokedAt() { return revokedAt; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public String getInviteLink() { return inviteLink; }
    public boolean isResent() { return resent; }
}
