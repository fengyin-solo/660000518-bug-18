import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getInvitationByToken } from '../services/invitationService';
import { getRoomByCode, getRoomById, joinRoom } from '../services/interviewRoomService';
import { useInterviewStore } from '../store/interview';
import type { InterviewRoom, User } from '../types';

type InvitationState = {
  token: string;
  status: string;
  candidateName: string;
  candidateEmail: string;
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '4px',
  border: '1px solid #444',
  background: '#2a2a2a',
  color: '#fff',
  fontSize: '14px',
  boxSizing: 'border-box',
  outline: 'none',
};

export const JoinRoomPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setCurrentUser, setCurrentRoom } = useInterviewStore();

  const [candidateName, setCandidateName] = useState('');
  const [candidateEmail, setCandidateEmail] = useState('');
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [invitation, setInvitation] = useState<InvitationState | null>(null);
  const [roomInfo, setRoomInfo] = useState<InterviewRoom | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(false);
  const [error, setError] = useState('');
  const [tokenError, setTokenError] = useState(false);

  useEffect(() => {
    const token = searchParams.get('token');
    const code = searchParams.get('code');

    if (token) {
      fetchInvitationByToken(token);
    } else if (code) {
      setRoomCodeInput(code.toUpperCase());
      fetchRoomByCode(code.toUpperCase());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const fetchInvitationByToken = async (token: string) => {
    setInitialLoading(true);
    setError('');
    setTokenError(false);
    try {
      const inv = await getInvitationByToken(token);
      setCandidateName(inv.candidateName || '');
      setCandidateEmail(inv.candidateEmail || '');
      setInvitation({
        token,
        status: inv.status,
        candidateName: inv.candidateName || '',
        candidateEmail: inv.candidateEmail || '',
      });
      const room = await getRoomById(inv.roomId);
      setRoomInfo(room);

      if (inv.status === 'REVOKED') {
        setTokenError(true);
        setError('该邀请已被撤销，请联系面试官重新获取邀请链接');
      } else if (room.status === 'COMPLETED' || room.status === 'CANCELLED') {
        setTokenError(true);
        setError(room.status === 'CANCELLED' ? '面试已取消，无法加入' : '面试已结束，无法加入');
      }
    } catch (err) {
      setTokenError(true);
      setRoomInfo(null);
      setInvitation(null);
      setError(err instanceof Error ? err.message : '获取邀请信息失败');
    } finally {
      setInitialLoading(false);
    }
  };

  const fetchRoomByCode = async (code: string) => {
    if (code.length !== 6) return;
    setError('');
    try {
      const room = await getRoomByCode(code);
      setRoomInfo(room);
      if (room.status === 'COMPLETED' || room.status === 'CANCELLED') {
        setError(room.status === 'CANCELLED' ? '面试已取消，无法加入' : '面试已结束，无法加入');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '房间不存在或已关闭');
      setRoomInfo(null);
    }
  };

  const handleRoomCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toUpperCase().slice(0, 6);
    setRoomCodeInput(value);
    if (value.length === 6) {
      fetchRoomByCode(value);
    } else {
      setRoomInfo(null);
    }
  };

  const roomUnavailable = !!roomInfo && (roomInfo.status === 'COMPLETED' || roomInfo.status === 'CANCELLED');
  const canSubmit = !!roomInfo && !roomUnavailable && !tokenError;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!candidateName.trim()) {
      setError('请输入候选人姓名');
      return;
    }
    if (!candidateEmail.trim()) {
      setError('请输入邮箱');
      return;
    }
    if (!roomInfo) {
      setError('请先输入有效的房间码或通过邀请链接进入');
      return;
    }
    if (roomUnavailable) {
      setError(roomInfo.status === 'CANCELLED' ? '面试已取消，无法加入' : '面试已结束，无法加入');
      return;
    }
    if (invitation && invitation.status === 'REVOKED') {
      setError('该邀请已被撤销，请联系面试官重新获取邀请链接');
      return;
    }

    setLoading(true);
    try {
      const inviteToken = invitation?.token || '';
      const result = await joinRoom(roomInfo.id, {
        candidateName: candidateName.trim(),
        inviteToken,
      });

      const user: User = {
        id: result.participant.userId,
        name: candidateName.trim(),
        email: candidateEmail.trim(),
        role: 'CANDIDATE',
        createdAt: new Date().toISOString(),
      };

      setCurrentUser(user);
      setCurrentRoom(result.room);
      navigate(`/room/${result.room.id}/candidate`);
    } catch (err) {
      // 加入失败时保留已填信息，可直接重试
      setError(err instanceof Error ? err.message : '加入房间失败');
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#0d0d0d',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{ color: '#fff', fontSize: '16px' }}>正在验证邀请信息...</div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0d0d0d',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
    }}>
      <div style={{
        background: '#1e1e1e',
        borderRadius: '8px',
        padding: '32px',
        width: '100%',
        maxWidth: '480px',
        border: '1px solid #333',
      }}>
        <h1 style={{
          color: '#fff',
          margin: '0 0 8px 0',
          fontSize: '24px',
          fontWeight: 600,
          textAlign: 'center',
        }}>
          加入面试
        </h1>
        <p style={{
          color: '#888',
          margin: '0 0 24px 0',
          fontSize: '14px',
          textAlign: 'center',
        }}>
          {invitation ? '邀请信息已自动填写，确认后即可加入' : '请填写以下信息以加入面试房间'}
        </p>

        {roomInfo && (
          <div style={{
            background: '#2a2a2a',
            borderRadius: '6px',
            padding: '16px',
            marginBottom: '20px',
            border: '1px solid #444',
          }}>
            <div style={{ color: '#888', fontSize: '12px', marginBottom: '4px' }}>房间信息</div>
            <div style={{ color: '#fff', fontSize: '16px', fontWeight: 500, marginBottom: '4px' }}>
              {roomInfo.title}
            </div>
            <div style={{ color: '#666', fontSize: '13px' }}>
              房间码: {roomInfo.roomCode}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{
              display: 'block',
              color: '#ccc',
              marginBottom: '6px',
              fontSize: '14px',
            }}>
              候选人姓名 *
            </label>
            <input
              type="text"
              value={candidateName}
              onChange={e => setCandidateName(e.target.value)}
              placeholder="请输入您的姓名"
              style={inputStyle}
              onFocus={e => !e.target.readOnly && (e.target.style.borderColor = '#2196f3')}
              onBlur={e => (e.target.style.borderColor = '#444')}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{
              display: 'block',
              color: '#ccc',
              marginBottom: '6px',
              fontSize: '14px',
            }}>
              邮箱 *
            </label>
            <input
              type="email"
              value={candidateEmail}
              onChange={e => setCandidateEmail(e.target.value)}
              placeholder="请输入您的邮箱"
              style={inputStyle}
              onFocus={e => !e.target.readOnly && (e.target.style.borderColor = '#2196f3')}
              onBlur={e => (e.target.style.borderColor = '#444')}
            />
          </div>

          {invitation ? (
            <div style={{
              marginBottom: '16px',
              padding: '10px 12px',
              borderRadius: '4px',
              background: '#252525',
              border: '1px solid #333',
              color: '#888',
              fontSize: '12px',
              wordBreak: 'break-all',
            }}>
              {tokenError ? '邀请链接无效' : '✓ 您正在通过专属邀请链接加入'}
            </div>
          ) : (
            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                color: '#ccc',
                marginBottom: '6px',
                fontSize: '14px',
              }}>
                房间码
              </label>
              <input
                type="text"
                value={roomCodeInput}
                onChange={handleRoomCodeChange}
                placeholder="请输入6位房间码"
                maxLength={6}
                style={{ ...inputStyle, fontSize: '18px', letterSpacing: '4px', textAlign: 'center', textTransform: 'uppercase' }}
                onFocus={e => (e.target.style.borderColor = '#2196f3')}
                onBlur={e => (e.target.style.borderColor = '#444')}
              />
            </div>
          )}

          {error && (
            <div style={{
              color: '#f44336',
              marginBottom: '16px',
              fontSize: '14px',
              padding: '10px 12px',
              background: 'rgba(244,67,54,0.1)',
              borderRadius: '4px',
              border: '1px solid rgba(244,67,54,0.3)',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !canSubmit}
            style={{
              width: '100%',
              padding: '12px 24px',
              borderRadius: '4px',
              border: 'none',
              background: '#2196f3',
              color: '#fff',
              cursor: loading || !canSubmit ? 'not-allowed' : 'pointer',
              fontSize: '16px',
              fontWeight: 500,
              opacity: loading || !canSubmit ? 0.6 : 1,
              transition: 'opacity 0.2s',
            }}
          >
            {loading ? '加入中...' : '加入面试'}
          </button>
        </form>

        {!invitation && (
          <p style={{
            color: '#666',
            margin: '16px 0 0 0',
            fontSize: '13px',
            textAlign: 'center',
          }}>
            已有邀请链接？点击链接可自动填写信息
          </p>
        )}
      </div>
    </div>
  );
};
