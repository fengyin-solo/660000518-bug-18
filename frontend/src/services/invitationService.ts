import { request } from './api';
import type { InviteCandidateRequest, InviteCandidateResponse, CandidateInvitation } from '../types';

export function createInvitation(data: InviteCandidateRequest): Promise<InviteCandidateResponse> {
  return request<InviteCandidateResponse>('/invitations', {
    method: 'POST',
    body: data,
  });
}

export function getInvitationsByRoom(roomId: string): Promise<CandidateInvitation[]> {
  return request<CandidateInvitation[]>(`/invitations/room/${roomId}`);
}

export function getInvitationByToken(token: string): Promise<CandidateInvitation> {
  return request<CandidateInvitation>(`/invitations/token/${encodeURIComponent(token)}`);
}

export function updateInvitationStatus(invitationId: string, status: string): Promise<CandidateInvitation> {
  // 后端使用 @RequestParam 接收状态，必须放在 query string 上（之前误发 JSON body 会 400）
  const params = new URLSearchParams({ status });
  return request<CandidateInvitation>(`/invitations/${invitationId}/status?${params.toString()}`, {
    method: 'PUT',
  });
}

export function deleteInvitation(invitationId: string): Promise<CandidateInvitation> {
  return request<CandidateInvitation>(`/invitations/${invitationId}`, {
    method: 'DELETE',
  });
}

/** 由邀请凭证拼出可直接打开的完整链接：打开后进入加入页并预填房间与身份 */
export function buildInviteLink(inviteToken: string): string {
  return `${window.location.origin}/join?token=${encodeURIComponent(inviteToken)}`;
}
