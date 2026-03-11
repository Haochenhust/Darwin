# AGENT.md

## Purpose

This document defines the product and architecture principles for Darwin.

Darwin is not a traditional rule-heavy bot. It is an Agent-centric system:

- The Agent should carry as much intelligence as possible.
- The engineering layer should stay thin.
- The engineering layer should provide reliable runtime, storage, transport, and recovery mechanisms.
- The engineering layer should not over-constrain how the Agent thinks, summarizes, remembers, or acts.

The core design rule is:

`Build soil for the Agent, not a cage for the Agent.`

## Reference Projects

When implementation details are unclear, Darwin should prioritize learning from the following reference projects before inventing a new pattern from scratch:

1. NanoClaw: `https://github.com/Haochenhust/ClawPartner/tree/feat/chenhao`
2. GraceBot: `https://github.com/Haochenhust/GraceBot`
3. OpenClaw: `https://github.com/openclaw/openclaw`
4. agentara: `https://github.com/MagicCube/agentara`

Reference usage rules:

- use these projects as the default external implementation references
- prefer borrowing module ideas, boundaries, and failure-handling patterns rather than copying structure blindly
- if a reference project conflicts with Darwin's core principles, Darwin's principles win
- when uncertain, compare multiple reference projects before making a local design decision

## V1 Priorities

The first production goal is narrow and explicit:

1. Darwin can stably talk with the user in Feishu private chat.
2. Darwin can reliably execute scheduled tasks.
3. Darwin's context and memory do not become chaotic from the user's perspective.

Group chat is not the first priority.

## Product Principles

### 1. Private Chat Is the Main Interface

Feishu private chat is the primary interaction surface for Darwin.

From the user's perspective, private chat should feel like one continuous conversation, even if the underlying runtime sessions rotate.

### 2. Agent-Centric Architecture

Darwin should delegate as much cognition as possible to the Agent.

The Agent should decide:

- what is worth remembering long term
- what should be summarized
- how to organize long-term knowledge
- how to react to messages and scheduled events

The engineering layer should not predefine excessive workflows, topic systems, state machines, or rigid memory policies unless reliability requires it.

### 3. Engineering Layer Stays Minimal

The engineering layer is responsible for:

- message transport
- persistence
- task triggering
- runtime isolation
- recovery
- observability

The engineering layer is not responsible for:

- correcting the Agent's reasoning
- deciding what the Agent should remember
- deciding how the Agent should summarize a conversation
- enforcing topic management in private chat

If the Agent is wrong, the system should let the Agent and the user resolve that through conversation. The engineering layer should mainly act as a reliable pipe.

## Conversation Model

### 1. No Topic Abstraction in Private Chat

Private chat should not introduce an external "topic" abstraction.

Private chat is treated as one continuous stream of interaction. Topic shifts, compression, and prioritization should be handled by the Agent itself, not by an outer orchestration model.

### 2. Runtime Sessions Are Internal Details

The user-facing experience is one continuous private chat.

Internally, `session_id` may rotate naturally because of:

- restart
- compaction
- phase transition
- recovery

This rotation is acceptable as long as the user experience remains continuous.

### 3. Current Conversation Has Priority

When recent conversation context and historical memory conflict, Darwin should prioritize the current conversation.

Default rule:

- recent conversation is strong signal
- long-term memory is weak reference
- old topics are only elevated when the user explicitly recalls them

## Memory Model

Darwin should start with the minimum viable memory model.

Only three layers are required:

1. Raw conversation messages
2. Agent compact summary
3. Long-term memory store

No additional user-profile layer or heavy structured memory layer is required in the initial design.

### 1. Raw Conversation Messages

Raw messages are the single source of truth.

Requirements:

- store complete private-chat message history
- make history retrievable before compaction
- preserve ordering and integrity

This layer must be the most reliable layer in the system.

### 2. Agent Compact Summary

Compact summary is a derived layer managed by the Agent.

Its purpose is to preserve continuity when context windows are compressed or runtime sessions rotate.

The system should support feeding the latest compact summary back into a fresh runtime session, but should avoid turning summary into a heavy external state machine.

### 3. Long-Term Memory Store

Long-term memory is also a derived layer managed by the Agent.

Initial form:

- free-form natural language entries
- Agent-readable
- Agent-writable
- weakly referenced unless relevant

The system should provide a place and mechanism for this memory, but should not decide in advance what categories must exist.

### 4. Reliability Hierarchy

Reliability priorities are intentionally asymmetric:

- raw conversation messages are durable source data
- compact summary is rebuildable derived data
- long-term memory is rebuildable derived data

If summary or long-term memory is partially wrong, missing, or stale, the system should prefer recovery through the Agent rather than expanding engineering complexity.

## Compaction Philosophy

Compaction should primarily remain an Agent concern.

The system may assist by exposing hooks or retrieval mechanisms before compaction, but it should not attempt to outsmart the Agent with external topic segmentation or aggressive memory rules.

Recommended principle:

- before compaction, make raw history accessible
- after compaction, continue using the latest summary plus raw history access as the continuity bridge

Private-chat continuity should be carried by:

- raw message history
- latest compact summary

No extra "chat state snapshot" abstraction is required at this stage.

## Scheduled Tasks

### 1. Scheduled Tasks Are Separate Triggers

Scheduled tasks should run in a separate `session_id`.

They are not a continuation of the active private-chat runtime session.

### 2. Scheduled Tasks Should Cold Start

A scheduled task session should start cold.

It should carry:

- the task description

It should not automatically inherit:

- the current private-chat runtime context
- the current private-chat transient discussion state

This reduces contamination between chat flow and task execution.

### 3. Task Results Return to Private Chat

Although scheduled tasks execute in isolated sessions, their result should be sent back into the user's Feishu private chat as a normal new Darwin message.

From the user's perspective, the scheduled task result should feel like Darwin proactively speaking in the same private conversation.

This preserves:

- execution isolation at runtime
- unified experience at the interface layer

## Architectural Boundaries

### What the Engineering Layer Must Guarantee

- Feishu private-chat message intake and delivery are reliable
- scheduled tasks can trigger reliably
- raw messages are durably stored
- session rotation and recovery do not break user-facing continuity
- the Agent can read and write its derived memory layers
- failures are observable through logs and diagnostics

### What the Engineering Layer Should Avoid Doing

- building a complex topic system for private chat
- imposing rigid memory schemas too early
- correcting the Agent's cognition in code
- replacing Agent decisions with hardcoded orchestration logic
- over-optimizing safety rails that reduce Agent freedom without clear reliability benefit

## Implementation Implications

These implications should guide engineering decisions:

1. Prefer simple, explicit storage and retrieval mechanisms over smart orchestration.
2. Treat private chat as the main continuity surface.
3. Treat `session_id` as internal runtime state, not product identity.
4. Preserve raw messages first; derive everything else later.
5. Keep long-term memory lightweight and free-form in V1.
6. Let the Agent evolve its own memory behavior before introducing stronger schemas.

## Open Questions

The following item is intentionally left open for later refinement:

- Should long-term memory entries be mostly append-only, or should the Agent freely revise existing entries?

Until that is decided, implementation should avoid locking the system into either strategy.
