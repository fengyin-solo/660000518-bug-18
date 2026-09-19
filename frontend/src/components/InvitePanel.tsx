import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createInvitation, getInvitationsByRoom, deleteInvitation, resendInvitation } from '../services/invitationService';
import { InviteCandidateRequest, CandidateInvitation, getInvitationStatusConfig } from '../types';
import { useInterviewStore } from '../store/interview';
import { useToastStore } from '../store/toast';

interface InvitePanelProps {
  roomId: string;
  roomCode: string;
}

const buildInviteLink = (token: string) =>
  `${window.location.origin}/join?token=${encodeURIComponent(token)}`;

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    // 非安全上下文（如 http 局域网地址）下的降级方案
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textArea);
    return ok;
  } catch {
    return false;
  }
}

export const InvitePanel: React.FC<InvitePanelProps> = ({ roomId, roomCode }) => {
  const { invitations, setInvitations } = useInterviewStore();
  const toast = useToastStore();
  const [candidateName, setCandidateName] = useState('');
  const [candidateEmail, setCandidateEmail] = useState('');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState('');
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [recordsError, setRecordsError] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const copyTimerRef = useRef<number | null>(null);

  const fetchInvitations = useCallback(async (silent = false) => {
    if (!silent) {
      setRecordsLoading(true);
      setRecordsError('');
    }
    try {
      const data = await getInvitationsByRoom(roomId);
      setInvitations(data);
    } catch (error) {
      console.error('Failed to fetch invitations:', error);
      if (!silent) {
        setRecordsError('邀请记录加载失败，请重试');
      }
    } finally {
      if (!silent) {
        setRecordsLoading(false);
      }
    }
  }, [roomId, setInvitations]);

  useEffect(() => {
    fetchInvitations();
  }, [fetchInvitations]);

  useEffect(() => () => {
    if (copyTimerRef.current) {
      clearTimeout(copyTimerRef.current);
    }
  }, []);

  const handleCopy = async (text: string, field: string) => {
    const ok = await copyText(text);
    if (ok) {
      setCopiedField(field);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setCopiedField(null), 2000);
      toast.success('已复制到剪贴板');
    } else {
      toast.error('复制失败，请手动选择文本复制');
    }
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;

    if (!candidateName.trim()) {
      setFormError('请输入候选人姓名');
      return;
    }
    if (!candidateEmail.trim()) {
      setFormError('请输入候选人邮箱');
      return;
    }

    const request: InviteCandidateRequest = {
      roomId,
      candidateName: candidateName.trim(),
      candidateEmail: candidateEmail.trim(),
    };

    setSending(true);
    setFormError('');
    try {
      const created = await createInvitation(request);
      // 发送成功：服务端返回的凭证立即可用，清空表单并保证记录准确
      setCandidateName('');
      setCandidateEmail('');
      toast.success(`邀请已发送给 ${created.candidateName}，可复制其专属链接`);
      await fetchInvitations(true);
    } catch (error: any) {
      // 失败时保留已填信息，方便修改后重试
      const message = error?.message || '邀请发送失败，请重试';
      setFormError(message);
      toast.error(message);
      fetchInvitations(true);
    } finally {
      setSending(false);
    }
  };

  const handleRevoke = async (invitation: CandidateInvitation) => {
    if (pendingId) return;
    setPendingId(invitation.id);
    try {
      await deleteInvitation(invitation.id);
      toast.success(`已撤销 ${invitation.candidateName} 的邀请，原链接立即失效`);
      await fetchInvitations(true);
    } catch (error: any) {
      const message = error?.message || '撤销失败，请重试';
      toast.error(message);
      // 撤销失败时以服务端状态为准重新拉取，避免面板与后端对不上
      await fetchInvitations(true);
    } finally {
      setPendingId(null);
    }
  };

  const handleResend = async (invitation: CandidateInvitation) => {
    if (pendingId) return;
    setPendingId(invitation.id);
    try {
      const updated = await resendInvitation(invitation.id);
      toast.success(`已向 ${updated.candidateName} 重新发送邀请，请复制新链接`);
      // 重新发送后新 token 生效，自动复制新链接，候选人打开即可进入对应房间并预填身份
      await handleCopy(buildInviteLink(updated.inviteToken), `link-${updated.id}`);
      await fetchInvitations(true);
    } catch (error: any) {
      const message = error?.message || '重新发送失败，请重试';
      toast.error(message);
      await fetchInvitations(true);
    } finally {
      setPendingId(null);
    }
  };

  const roomInviteLink = `${window.location.origin}/join?code=${encodeURIComponent(roomCode)}`;

  const renderCopyButton = (text: string, field: string) => (
    <button
      type="button"
      onClick={() => handleCopy(text, field)}
      style={{
        padding: '4px 12px',
        background: copiedField === field ? '#4caf50' : '#3a3a3a',
        color: '#fff',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '12px',
        whiteSpace: 'nowrap',
      }}
    >
      {copiedField === field ? '已复制' : '复制'}
    </button>
  );

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
            {renderCopyButton(roomCode, 'code')}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>邀请链接（按房间码加入）</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: '#bbb', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{roomInviteLink}</span>
            {renderCopyButton(roomInviteLink, 'link')}
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
            fontSize: '12px',
            padding: '8px 10px',
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
            background: sending ? '#155a8a' : '#2196f3',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: sending ? 'not-allowed' : 'pointer',
            fontSize: '14px',
            fontWeight: '500',
          }}
        >
          {sending ? '发送中...' : '发送邀请'}
        </button>
      </form>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: '14px', color: '#fff' }}>邀请记录</h3>
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {recordsLoading ? (
            <div style={{ color: '#666', fontSize: '13px', textAlign: 'center', padding: '20px' }}>
              加载中...
            </div>
          ) : recordsError ? (
            <div style={{ textAlign: 'center', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
              <span style={{ color: '#f44336', fontSize: '13px' }}>{recordsError}</span>
              <button
                onClick={() => fetchInvitations()}
                style={{
                  padding: '6px 16px',
                  background: '#3a3a3a',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
              >
                重新加载
              </button>
            </div>
          ) : invitations.length === 0 ? (
            <div style={{ color: '#666', fontSize: '13px', textAlign: 'center', padding: '20px' }}>
              暂无邀请记录
            </div>
          ) : (
            invitations.map((invitation) => {
              const statusConfig = getInvitationStatusConfig(invitation.status);
              const actionPending = pendingId === invitation.id;
              return (
                <div key={invitation.id} style={{
                  background: '#2a2a2a',
                  padding: '12px',
                  borderRadius: '6px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  opacity: invitation.status === 'REVOKED' ? 0.65 : 1,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: '500', color: '#fff' }}>{invitation.candidateName}</span>
                    <span style={{
                      padding: '2px 10px',
                      borderRadius: '12px',
                      fontSize: '11px',
                      color: '#fff',
                      background: statusConfig.color,
                    }}>
                      {statusConfig.label}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#888' }}>{invitation.candidateEmail}</div>

                  {invitation.status === 'PENDING' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{
                        flex: 1,
                        fontSize: '11px',
                        color: '#666',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {buildInviteLink(invitation.inviteToken)}
                      </span>
                      {renderCopyButton(buildInviteLink(invitation.inviteToken), `record-link-${invitation.id}`)}
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', color: '#666' }}>
                      {new Date(invitation.createdAt).toLocaleString()}
                    </span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {(invitation.status === 'REVOKED' || invitation.status === 'DECLINED' || invitation.status === 'LEFT') && (
                        <button
                          onClick={() => handleResend(invitation)}
                          disabled={actionPending}
                          style={{
                            padding: '4px 10px',
                            background: 'transparent',
                            color: actionPending ? '#666' : '#2196f3',
                            border: '1px solid #2196f3',
                            borderRadius: '4px',
                            cursor: actionPending ? 'not-allowed' : 'pointer',
                            fontSize: '11px',
                          }}
                        >
                          {actionPending ? '处理中...' : '重新发送'}
                        </button>
                      )}
                      {invitation.status === 'PENDING' && (
                        <button
                          onClick={() => handleRevoke(invitation)}
                          disabled={actionPending}
                          style={{
                            padding: '4px 10px',
                            background: 'transparent',
                            color: actionPending ? '#666' : '#f44336',
                            border: '1px solid #f44336',
                            borderRadius: '4px',
                            cursor: actionPending ? 'not-allowed' : 'pointer',
                            fontSize: '11px',
                          }}
                        >
                          {actionPending ? '处理中...' : '撤销'}
                        </button>
                      )}
                    </div>
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
