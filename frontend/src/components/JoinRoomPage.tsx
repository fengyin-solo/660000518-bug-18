import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getInvitationByToken } from '../services/invitationService';
import { getRoomByCode, getRoomById, joinRoom } from '../services/interviewRoomService';
import { useInterviewStore } from '../store/interview';
import type { InterviewRoom, User } from '../types';

export const JoinRoomPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setCurrentUser, setCurrentRoom } = useInterviewStore();

  const [candidateName, setCandidateName] = useState('');
  const [candidateEmail, setCandidateEmail] = useState('');
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [tokenFromUrl, setTokenFromUrl] = useState('');
  const [roomInfo, setRoomInfo] = useState<InterviewRoom | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    const code = searchParams.get('code');

    if (token) {
      setTokenFromUrl(token);
      fetchInvitationByToken(token);
    } else if (code) {
      setRoomCodeInput(code);
      fetchRoomByCode(code);
    }
  }, [searchParams]);

  const fetchInvitationByToken = async (token: string) => {
    setInitialLoading(true);
    setError('');
    try {
      const invitation = await getInvitationByToken(token);
      setCandidateName(invitation.candidateName || '');
      setCandidateEmail(invitation.candidateEmail || '');
      const room = await getRoomById(invitation.roomId);
      setRoomInfo(room);
    } catch (err) {
      setRoomInfo(null);
      setError(err instanceof Error ? err.message : '获取邀请信息失败');
    } finally {
      setInitialLoading(false);
    }
  };

  const fetchRoomByCode = async (code: string) => {
    if (code.length !== 6) return;
    setInitialLoading(true);
    setError('');
    try {
      const room = await getRoomByCode(code);
      setRoomInfo(room);
    } catch (err) {
      setError(err instanceof Error ? err.message : '房间不存在或已关闭');
      setRoomInfo(null);
    } finally {
      setInitialLoading(false);
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

    setLoading(true);
    try {
      const inviteToken = tokenFromUrl || '';
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
        <div style={{ color: '#fff', fontSize: '16px' }}>加载中...</div>
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
          请填写以下信息以加入面试房间
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
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '4px',
                border: '1px solid #444',
                background: '#2a2a2a',
                color: '#fff',
                fontSize: '14px',
                boxSizing: 'border-box',
                outline: 'none',
              }}
              onFocus={e => e.target.style.borderColor = '#2196f3'}
              onBlur={e => e.target.style.borderColor = '#444'}
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
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '4px',
                border: '1px solid #444',
                background: '#2a2a2a',
                color: '#fff',
                fontSize: '14px',
                boxSizing: 'border-box',
                outline: 'none',
              }}
              onFocus={e => e.target.style.borderColor = '#2196f3'}
              onBlur={e => e.target.style.borderColor = '#444'}
            />
          </div>

          {tokenFromUrl ? (
            <div style={{ marginBottom: '16px' }}>
              <div style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '4px',
                border: '1px solid rgba(76, 175, 80, 0.3)',
                background: 'rgba(76, 175, 80, 0.08)',
                color: '#4caf50',
                fontSize: '13px',
                boxSizing: 'border-box',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}>
                <span>✓</span>
                <span>您正在通过专属邀请链接加入，身份信息已为您自动填写</span>
              </div>
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
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '4px',
                  border: '1px solid #444',
                  background: '#2a2a2a',
                  color: '#fff',
                  fontSize: '18px',
                  letterSpacing: '4px',
                  textAlign: 'center',
                  boxSizing: 'border-box',
                  outline: 'none',
                  textTransform: 'uppercase',
                }}
                onFocus={e => e.target.style.borderColor = '#2196f3'}
                onBlur={e => e.target.style.borderColor = '#444'}
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
              <div>{error}</div>
              {tokenFromUrl && !roomInfo && (
                <button
                  type="button"
                  onClick={() => { setTokenFromUrl(''); setError(''); setRoomInfo(null); }}
                  style={{
                    marginTop: '8px',
                    padding: '4px 12px',
                    background: 'transparent',
                    color: '#2196f3',
                    border: '1px solid #2196f3',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px',
                  }}
                >
                  改用房间码加入
                </button>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !roomInfo}
            style={{
              width: '100%',
              padding: '12px 24px',
              borderRadius: '4px',
              border: 'none',
              background: '#2196f3',
              color: '#fff',
              cursor: loading || !roomInfo ? 'not-allowed' : 'pointer',
              fontSize: '16px',
              fontWeight: 500,
              opacity: loading || !roomInfo ? 0.6 : 1,
              transition: 'opacity 0.2s',
            }}
          >
            {loading ? '加入中...' : '加入面试'}
          </button>
        </form>

        {!tokenFromUrl && (
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
