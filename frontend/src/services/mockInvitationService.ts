import type { CandidateInvitation, InviteCandidateRequest } from '../types';

const STORAGE_KEY = 'code_interview_invitations';

export interface MockJoinContext {
  roomId: string;
  participantId: string;
}

const loadFromStorage = (): CandidateInvitation[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.warn('Failed to load invitations from storage:', e);
  }
  return [];
};

const saveToStorage = (invitations: CandidateInvitation[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(invitations));
  } catch (e) {
    console.warn('Failed to save invitations to storage:', e);
  }
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const withInviteLink = (invitation: CandidateInvitation): CandidateInvitation => ({
  ...invitation,
  inviteLink: `/join?token=${invitation.inviteToken}`,
});

const generateToken = () =>
  'mock-' + Date.now() + '-' + Math.random().toString(36).substring(2, 10) +
  Math.random().toString(36).substring(2, 10);

export async function mockCreateInvitation(data: InviteCandidateRequest): Promise<CandidateInvitation> {
  await delay(300);
  const invitations = loadFromStorage();

  if (invitations.some(inv =>
    inv.roomId === data.roomId &&
    inv.candidateEmail.trim().toLowerCase() === data.candidateEmail.trim().toLowerCase() &&
    inv.status === 'PENDING'
  )) {
    const error = new Error('该候选人已有一封待接受的邀请，请直接复制邀请链接或先撤销后重发') as any;
    error.status = 409;
    throw error;
  }

  const invitation: CandidateInvitation = {
    id: 'inv-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9),
    roomId: data.roomId,
    candidateName: data.candidateName.trim(),
    candidateEmail: data.candidateEmail.trim(),
    inviteToken: generateToken(),
    status: 'PENDING',
    createdAt: new Date().toISOString(),
  };

  invitations.unshift(invitation);
  saveToStorage(invitations);
  return withInviteLink(invitation);
}

export async function mockGetInvitationsByRoom(roomId: string): Promise<CandidateInvitation[]> {
  await delay(200);
  return loadFromStorage()
    .filter(inv => inv.roomId === roomId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map(withInviteLink);
}

export async function mockGetInvitationByToken(token: string): Promise<CandidateInvitation> {
  await delay(200);
  const invitation = loadFromStorage().find(inv => inv.inviteToken === token);
  if (!invitation) {
    throw new Error('邀请链接无效或不存在');
  }
  return withInviteLink(invitation);
}

export async function mockRevokeInvitation(invitationId: string): Promise<CandidateInvitation> {
  await delay(200);
  const invitations = loadFromStorage();
  const index = invitations.findIndex(inv => inv.id === invitationId);
  if (index === -1) {
    throw new Error('邀请不存在');
  }
  if (invitations[index].status !== 'PENDING') {
    throw new Error('只有待接受的邀请可以撤销');
  }
  invitations[index] = {
    ...invitations[index],
    status: 'REVOKED',
    revokedAt: new Date().toISOString(),
  };
  saveToStorage(invitations);
  return withInviteLink(invitations[index]);
}

export async function mockResendInvitation(invitationId: string): Promise<CandidateInvitation> {
  await delay(300);
  const invitations = loadFromStorage();
  const index = invitations.findIndex(inv => inv.id === invitationId);
  if (index === -1) {
    throw new Error('邀请不存在');
  }
  if (invitations[index].status === 'PENDING') {
    throw new Error('邀请仍处于待接受状态，无需重新发送');
  }
  if (invitations[index].status === 'JOINED') {
    throw new Error('候选人已加入房间，无法重新发送');
  }
  invitations[index] = {
    ...invitations[index],
    inviteToken: generateToken(),
    status: 'PENDING',
    joinedAt: undefined,
    revokedAt: undefined,
    participantId: undefined,
    createdAt: new Date().toISOString(),
  };
  saveToStorage(invitations);
  return withInviteLink(invitations[index]);
}

export function mockMarkInvitationJoinedByToken(token: string, participantId: string): void {
  const invitations = loadFromStorage();
  const index = invitations.findIndex(inv => inv.inviteToken === token);
  if (index !== -1 && invitations[index].status !== 'JOINED') {
    invitations[index] = {
      ...invitations[index],
      status: 'JOINED',
      joinedAt: new Date().toISOString(),
      participantId,
    };
    saveToStorage(invitations);
  }
}
