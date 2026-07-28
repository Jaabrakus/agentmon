-- PostgreSQL/Supabase canonical ownership authority. Requires pgcrypto.
-- JWT gateways must set request.jwt.claim.sub to the authenticated actor UUID.
create extension if not exists pgcrypto;

create table if not exists agentmon_ownership_heads (
  creature_id text primary key,
  genesis_dna text not null,
  current_dna text not null,
  sequence bigint not null default 0 check (sequence >= 0),
  status text not null check (status in ('active', 'pending-transfer', 'disputed', 'revoked')),
  owner_subject uuid not null,
  pending_transfer jsonb,
  dispute jsonb,
  revocation jsonb,
  recovery jsonb,
  head_digest text not null check (head_digest ~ '^[0-9a-f]{64}$'),
  updated_at timestamptz not null default now()
);

create table if not exists agentmon_ownership_commands (
  id uuid primary key default gen_random_uuid(),
  creature_id text not null references agentmon_ownership_heads(creature_id),
  sequence bigint not null,
  actor_subject uuid not null,
  command_type text not null,
  command_digest text not null check (command_digest ~ '^[0-9a-f]{64}$'),
  command jsonb not null,
  created_at timestamptz not null default now(),
  unique (creature_id, sequence)
);

create table if not exists agentmon_authorities (
  subject uuid primary key,
  can_resolve_disputes boolean not null default false,
  can_revoke boolean not null default false,
  can_recover boolean not null default false,
  disabled_at timestamptz
);

alter table agentmon_ownership_heads enable row level security;
alter table agentmon_ownership_commands enable row level security;
alter table agentmon_authorities enable row level security;

create or replace function agentmon_actor_subject() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create or replace function agentmon_head_digest(p_head jsonb) returns text
language sql immutable as $$ select encode(digest(p_head::text, 'sha256'), 'hex') $$;

create or replace function agentmon_apply_ownership_command(
  p_creature_id text,
  p_expected_sequence bigint,
  p_expected_head_digest text,
  p_command jsonb
) returns agentmon_ownership_heads
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_head agentmon_ownership_heads%rowtype;
  v_actor uuid := agentmon_actor_subject();
  v_type text := p_command->>'type';
  v_authority agentmon_authorities%rowtype;
  v_next jsonb;
begin
  if v_actor is null then raise exception 'authenticated actor required'; end if;
  select * into v_head from agentmon_ownership_heads where creature_id = p_creature_id for update;
  if not found then raise exception 'ownership head not found'; end if;
  if v_head.sequence <> p_expected_sequence or v_head.head_digest <> p_expected_head_digest then
    raise exception 'ownership compare-and-swap conflict' using errcode = '40001';
  end if;

  if v_type = 'propose-transfer' then
    if v_actor <> v_head.owner_subject or v_head.status <> 'active' then raise exception 'active owner required'; end if;
    v_head.status := 'pending-transfer';
    v_head.pending_transfer := jsonb_build_object('transferId', p_command->>'transferId', 'fromSubject', v_actor, 'recipientSubject', (p_command->>'recipientSubject')::uuid, 'expiresAt', p_command->>'expiresAt');
  elsif v_type = 'accept-transfer' then
    if v_head.status <> 'pending-transfer' or v_actor <> (v_head.pending_transfer->>'recipientSubject')::uuid then raise exception 'intended recipient required'; end if;
    if (v_head.pending_transfer->>'expiresAt')::timestamptz <= now() then raise exception 'pending transfer expired'; end if;
    v_head.owner_subject := v_actor; v_head.status := 'active'; v_head.pending_transfer := null;
  elsif v_type = 'cancel-transfer' then
    if v_actor <> v_head.owner_subject or v_head.status <> 'pending-transfer' then raise exception 'pending owner required'; end if;
    v_head.status := 'active'; v_head.pending_transfer := null;
  elsif v_type = 'open-dispute' then
    if v_actor <> v_head.owner_subject and v_actor <> nullif(v_head.pending_transfer->>'recipientSubject', '')::uuid then raise exception 'standing required'; end if;
    if v_head.status = 'revoked' then raise exception 'revoked head cannot be disputed'; end if;
    v_head.status := 'disputed';
    v_head.dispute := jsonb_build_object('disputeId', p_command->>'disputeId', 'openedBy', v_actor, 'reasonCode', p_command->>'reasonCode', 'status', 'open');
  elsif v_type in ('resolve-dispute', 'revoke', 'recover') then
    select * into v_authority from agentmon_authorities where subject = v_actor and disabled_at is null;
    if not found then raise exception 'authority required'; end if;
    if v_type = 'resolve-dispute' then
      if not v_authority.can_resolve_disputes or v_head.status <> 'disputed' then raise exception 'dispute authority required'; end if;
      v_head.owner_subject := (p_command->>'ownerSubject')::uuid; v_head.status := 'active'; v_head.pending_transfer := null;
      v_head.dispute := v_head.dispute || jsonb_build_object('status', 'resolved', 'resolvedBy', v_actor);
    elsif v_type = 'revoke' then
      if not v_authority.can_revoke then raise exception 'revocation authority required'; end if;
      v_head.status := 'revoked'; v_head.pending_transfer := null;
      v_head.revocation := jsonb_build_object('reasonCode', p_command->>'reasonCode', 'revokedBy', v_actor, 'at', now());
    else
      if not v_authority.can_recover or v_head.status not in ('active', 'disputed') then raise exception 'recovery authority required'; end if;
      v_head.recovery := jsonb_build_object('priorOwnerSubject', v_head.owner_subject, 'recoveredBy', v_actor, 'evidenceDigest', p_command->>'evidenceDigest', 'at', now());
      v_head.owner_subject := (p_command->>'newOwnerSubject')::uuid; v_head.status := 'active'; v_head.pending_transfer := null;
    end if;
  else raise exception 'unknown ownership command'; end if;

  v_head.sequence := v_head.sequence + 1; v_head.updated_at := now();
  v_next := jsonb_build_object('creatureId', v_head.creature_id, 'genesisDNA', v_head.genesis_dna, 'currentDNA', v_head.current_dna, 'sequence', v_head.sequence, 'status', v_head.status, 'ownerSubject', v_head.owner_subject, 'pendingTransfer', v_head.pending_transfer, 'dispute', v_head.dispute, 'revocation', v_head.revocation, 'recovery', v_head.recovery);
  v_head.head_digest := agentmon_head_digest(v_next);
  update agentmon_ownership_heads set sequence=v_head.sequence, status=v_head.status, owner_subject=v_head.owner_subject, pending_transfer=v_head.pending_transfer, dispute=v_head.dispute, revocation=v_head.revocation, recovery=v_head.recovery, head_digest=v_head.head_digest, updated_at=v_head.updated_at where creature_id=p_creature_id;
  insert into agentmon_ownership_commands(creature_id, sequence, actor_subject, command_type, command_digest, command)
  values (p_creature_id, v_head.sequence, v_actor, v_type, encode(digest(p_command::text, 'sha256'), 'hex'), p_command);
  return v_head;
end $$;

revoke all on function agentmon_apply_ownership_command(text, bigint, text, jsonb) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function agentmon_apply_ownership_command(text, bigint, text, jsonb) to authenticated;
  end if;
end $$;
