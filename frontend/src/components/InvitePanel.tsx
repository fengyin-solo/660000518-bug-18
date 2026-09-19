import React, { useState, useEffect, useRef } from 'react';
import { createInvitation, getInvitationsByRoom, deleteInvitation, buildInviteLink } from '../services/invitationService';
import { InviteCandidateRequest, CandidateInvitation, getInvitationStatusConfig } from '../types';
import { useInterviewStore } from '../store/interview';
import { useToastStore } from '../store/toast';

interface InvitePanelProps {
  roomId: string;
  roomCode: string;
}

export const InvitePanel: React.FC<InvitePanelProps> = ({ roomId, roomCode }) => {
  const { invitations, setInvitations } = useInterviewStore();
  const toast = useToastStore();
  const [candidateName, setCandidateName] = useState('');
  const [candidateEmail, setCandidateEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  // 正在撤销的邀请 id 集合，避免重复点击 / 状态对不上
  const [revokingIds, setRevokingIds] = useState<Set<string>>(new Set());
  const copyTimerRef = useRef<number | null>(null);

  const fetchInvitations = async (silent = false) => {
    try {
      const data = await getInvitationsByRoom(roomId);
      setInvitations(data);
    } catch (error) {
      console.error('Failed to fetch invitations:', error);
      if (!silent) {
        toast.error('邀请记录加载失败，请稍后重试');
      }
    }
  };

  useEffect(() => {
    fetchInvitations();
    return () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const copyToClipboard = async (text: string, key: string, okMessage: string) => {
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        ok = true;
      } else {
        // 非安全上下文（http / 旧浏览器）回退方案
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        ok = document.execCommand('copy');
        document.body.removeChild(textarea);
      }
    } catch (err) {
      console.error('Failed to copy:', err);
      ok = false;
    }

    if (ok) {
      setCopiedKey(key);
      toast.success(okMessage);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setCopiedKey(null), 2000);
    } else {
      toast.error('复制失败，请手动选择链接复制');
    }
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;

    const name = candidateName.trim();
    const email = candidateEmail.trim();

    if (!name) {
      setFormError('请输入候选人姓名');
      return;
    }
    if (!email) {
      setFormError('请输入候选人邮箱');
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setFormError('邮箱格式不正确');
      return;
    }

    const request: InviteCandidateRequest = { roomId, candidateName: name, candidateEmail: email };
    setSending(true);
    setFormError('');
    try {
      const response = await createInvitation(request);
      // 成功后清空表单；失败时保留已填信息以便重试
      setCandidateName('');
      setCandidateEmail('');
      // WebSocket 广播会刷新列表，这里也兜底刷新一次
      fetchInvitations(true);
      if (response.resent) {
        toast.info('该候选人已有待接受的邀请，已复用原邀请链接');
      } else {
        toast.success('邀请已发送，可复制下方邀请链接发给候选人');
      }
    } catch (error) {
      // 不清空 candidateName / candidateEmail，用户可直接重试
      const message = error instanceof Error ? error.message : '发送邀请失败';
      setFormError(message);
      toast.error(message);
    } finally {
      setSending(false);
    }
  };

  const handleRevoke = async (invitation: CandidateInvitation) => {
    if (revokingIds.has(invitation.id)) return;
    setRevokingIds((prev) => new Set(prev).add(invitation.id));
    try {
      await deleteInvitation(invitation.id);
      toast.success(`已撤销 ${invitation.candidateName} 的邀请`);
      fetchInvitations(true);
    } catch (error) {
      console.error('Failed to revoke invitation:', error);
      toast.error(error instanceof Error ? error.message : '撤销失败，请稍后重试');
    } finally {
      setRevokingIds((prev) => {
        const next = new Set(prev);
        next.delete(invitation.id);
        return next;
      });
    }
  };

  // 房间邀请码链接：打开后进入加入页并预填房间码（候选人再填身份）
  const roomCodeLink = `${window.location.origin}/join?code=${encodeURIComponent(roomCode)}`;

  return (
    <div style={{
      width: '420px',
      padding: '24px',
      background: '#1e1e1e',
      color: '#e0e0e0',
      overflowY: 'auto',
      borderRight: '1px solid #333',
      display: 'flex',
      flexDirection: 'column',
      gap: '24px',
    }}>
      <h2 style={{ margin: 0, fontSize: '20px', color: '#fff' }}>邀请候选人</h2>

      <div style={{ background: '#2a2a2a', padding: '16px', borderRadius: '8px' }}>
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>房间邀请码</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#fff', letterSpacing: '2px' }}>{roomCode}</span>
            <button
              type="button"
              onClick={() => copyToClipboard(roomCode, 'code', '房间码已复制')}
              style={{
                padding: '4px 12px',
                background: copiedKey === 'code' ? '#4caf50' : '#3a3a3a',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              {copiedKey === 'code' ? '已复制' : '复制'}
            </button>
          </div>
        </div>
        <div>
          <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>邀请链接（按房间码加入）</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span title={roomCodeLink} style={{ fontSize: '12px', color: '#bbb', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{roomCodeLink}</span>
            <button
              type="button"
              onClick={() => copyToClipboard(roomCodeLink, 'link', '邀请链接已复制')}
              style={{
                padding: '4px 12px',
                background: copiedKey === 'link' ? '#4caf50' : '#3a3a3a',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
                flexShrink: 0,
              }}
            >
              {copiedKey === 'link' ? '已复制' : '复制'}
            </button>
          </div>
        </div>
      </div>

      <form onSubmit={handleSendInvite} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '12px', color: '#888', marginBottom: '4px' }}>候选人姓名</label>
          <input
            type="text"
            value={candidateName}
            onChange={(e) => { setCandidateName(e.target.value); setFormError(''); }}
            placeholder="请输入候选人姓名"
            disabled={sending}
            style={{
              width: '100%',
              padding: '10px 12px',
              background: '#2a2a2a',
              border: '1px solid #444',
              borderRadius: '4px',
              color: '#fff',
              fontSize: '14px',
              boxSizing: 'border-box',
            }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '12px', color: '#888', marginBottom: '4px' }}>候选人邮箱</label>
          <input
            type="email"
            value={candidateEmail}
            onChange={(e) => { setCandidateEmail(e.target.value); setFormError(''); }}
            placeholder="请输入候选人邮箱"
            disabled={sending}
            style={{
              width: '100%',
              padding: '10px 12px',
              background: '#2a2a2a',
              border: '1px solid #444',
              borderRadius: '4px',
              color: '#fff',
              fontSize: '14px',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {formError && (
          <div style={{
            color: '#f44336',
            fontSize: '13px',
            padding: '8px 12px',
            background: 'rgba(244,67,54,0.1)',
            borderRadius: '4px',
            border: '1px solid rgba(244,67,54,0.3)',
          }}>
            {formError}
          </div>
        )}

        <button
          type="submit"
          disabled={sending}
          style={{
            padding: '10px 16px',
            background: '#2196f3',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: sending ? 'not-allowed' : 'pointer',
            fontSize: '14px',
            fontWeight: '500',
            opacity: sending ? 0.6 : 1,
          }}
        >
          {sending ? '发送中...' : '发送邀请'}
        </button>
      </form>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: '14px', color: '#fff' }}>邀请记录</h3>
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {invitations.length === 0 ? (
            <div style={{ color: '#666', fontSize: '13px', textAlign: 'center', padding: '20px' }}>
              暂无邀请记录
            </div>
          ) : (
            invitations.map((invitation) => {
              const statusConfig = getInvitationStatusConfig(invitation.status);
              const inviteLink = buildInviteLink(invitation.inviteToken);
              const isRevoking = revokingIds.has(invitation.id);
              const copyKey = `invite-${invitation.id}`;
              return (
                <div key={invitation.id} style={{
                  background: '#2a2a2a',
                  padding: '12px',
                  borderRadius: '6px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: '500', color: '#fff' }}>{invitation.candidateName}</span>
                    <span style={{
                      padding: '2px 10px',
                      borderRadius: '12px',
                      fontSize: '11px',
                      color: statusConfig.color,
                      background: statusConfig.bgColor,
                      border: `1px solid ${statusConfig.color}55`,
                    }}>
                      {statusConfig.label}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#888' }}>{invitation.candidateEmail}</div>

                  {invitation.status === 'PENDING' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span title={inviteLink} style={{
                        fontSize: '11px',
                        color: '#4caf50',
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {inviteLink}
                      </span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(inviteLink, copyKey, '专属邀请链接已复制')}
                        style={{
                          padding: '4px 10px',
                          background: copiedKey === copyKey ? '#4caf50' : '#3a3a3a',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '11px',
                          flexShrink: 0,
                        }}
                      >
                        {copiedKey === copyKey ? '已复制' : '复制链接'}
                      </button>
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', color: '#666' }}>
                      {new Date(invitation.createdAt).toLocaleString()}
                    </span>
                    {invitation.status === 'PENDING' && (
                      <button
                        type="button"
                        onClick={() => handleRevoke(invitation)}
                        disabled={isRevoking}
                        style={{
                          padding: '4px 10px',
                          background: 'transparent',
                          color: '#f44336',
                          border: '1px solid #f44336',
                          borderRadius: '4px',
                          cursor: isRevoking ? 'not-allowed' : 'pointer',
                          fontSize: '11px',
                          opacity: isRevoking ? 0.5 : 1,
                        }}
                      >
                        {isRevoking ? '撤销中...' : '撤销'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
