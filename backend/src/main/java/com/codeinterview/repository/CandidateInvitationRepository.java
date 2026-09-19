package com.codeinterview.repository;

import com.codeinterview.model.CandidateInvitation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface CandidateInvitationRepository extends JpaRepository<CandidateInvitation, String> {
    List<CandidateInvitation> findByRoomIdOrderByCreatedAtDesc(String roomId);
    Optional<CandidateInvitation> findByInviteToken(String inviteToken);
    Optional<CandidateInvitation> findFirstByRoomIdAndCandidateEmailIgnoreCaseOrderByCreatedAtDesc(String roomId, String candidateEmail);
}
