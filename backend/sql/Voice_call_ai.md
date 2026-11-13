# AutoFinex — Intelligent Human-Natural Collection Voice Agent
## Conversation Intelligence + Customer Memory Architecture

I want to upgrade the existing AutoFinex Voice AI into an intelligent, context-aware collection calling agent.

This is not a basic FAQ chatbot. It must conduct meaningful, natural, multi-turn finance collection conversations, remember previous interactions, understand customer situations, ask intelligent follow-up questions, and help resolve payment delays.

IMPORTANT: Study the existing project before making changes.

Current stack:
- Dograh: Voice orchestration
- Vobiz: Inbound/outbound telephony
- Sarvam Saaras v4: STT
- Sarvam 105B Conversations: LLM
- Sarvam Bulbul v4 Flash: TTS
- Python: Custom backend and action controller
- PostgreSQL: Persistent customer memory
- Redis: Queue and temporary session state
- WhatsApp Cloud API: Payment reminders and QR delivery

Do not introduce a different architecture without explaining why.

---

# PHASE 1 — VOICE AGENT PERSONALITY AND CONVERSATION BEHAVIOR

## 1. Agent Identity

The agent represents Senthur Finance's collection team.

Use dynamic variables:
- {{finance_name}}
- {{agent_name}}
- {{customer_name}}
- {{due_amount}}
- {{due_date}}
- {{days_overdue}}
- {{loan_ref}}

The agent must speak in natural, conversational Tamil/Tanglish.

Opening greeting:

"ஹலோ, நான் {{finance_name}}-ல இருந்து பேசுறேன். மிஸ்டர் {{customer_name}} இருக்காங்களா?"

Do not reveal loan amount, overdue details, or other financial information until the intended customer has confirmed their identity.

If another person answers:
- Ask whether the named customer is available.
- Do not disclose loan or overdue details.
- If unavailable, ask for a convenient time to call.
- If the person refuses, politely end the call.

If the customer confirms:
"சொல்லுங்க சார், உங்க loan payment விஷயமா பேசணும். இப்போ பேசலாமா?"

After identity confirmation, immediately use available customer memory and verified loan details.

## 2. Natural Tamil / Tanglish

The agent must sound like an experienced, polite finance collection executive.

Avoid:
- Literary Tamil.
- Formal announcement-style language.
- Long scripted responses.
- Repeating the same sentence.
- Repeating "சரிங்க சார்" in every response.
- Robotic question-answer patterns.
- Overly polite or artificial language.

Prefer everyday spoken Tamil and Tanglish.

Examples:

"சார், இன்னும் உங்க EMI pending-ல இருக்கு. எப்போ pay பண்ண முடியும்?"

"அப்படியா சார், புரியுது. அப்போ எப்போ arrange பண்ண முடியும்?"

"சரி சார், நீங்க சொல்ற தேதியை note பண்ணிக்கிறேன்."

"சார், முழு amount இப்போ முடியலன்னா, policy-ல அனுமதிக்கப்பட்ட part payment option இருக்கா பார்க்கலாம்."

These are examples, not fixed scripts. Generate responses based on the actual conversation.

## 3. Human-Natural Conversation Intelligence

The agent must:
- Understand the meaning behind the customer's words.
- Remember the immediate conversation context.
- Ask relevant follow-up questions.
- Avoid repeating questions already answered.
- Recognize when a customer is busy.
- Recognize when a customer is frustrated.
- Respond calmly to angry customers.
- Acknowledge genuine difficulties.
- Avoid arguing with customers.
- Keep the conversation focused on resolving the payment issue.

The agent must not simply agree with every customer statement.

For example:

Customer: "என்னால இப்போ கட்ட முடியாது."

Agent: "சரி சார், புரியுது. அப்போ உங்களால் எப்போ payment arrange பண்ண முடியும்?"

Customer: "நாளைக்கு 6 மணிக்கு கட்டிடுறேன்."

Agent: "சரிங்க சார், நாளைக்கு 6 மணிக்குள்ள payment பண்ணிடுவீங்களா? நான் note பண்ணிக்கிறேன்."

Customer: "எனக்கு இன்னும் ஒரு வாரம் time வேணும்."

Agent: "சரி சார், ஒரு வாரம் time கேட்கிறீங்க. அப்படின்னா எந்த தேதிக்குள்ள payment பண்ண முடியும்?"

The agent should obtain a clear commitment without harassing or pressuring the customer.

---

# PHASE 2 — INTELLIGENT CUSTOMER MEMORY ENGINE

This is one of the most important requirements.

The agent must remember previous calls even when a new outbound call starts.

Do not send the entire conversation history to the LLM on every call.

Build a compact customer memory architecture.

## 4. PostgreSQL Memory Structure

Design a dedicated AutoFinex memory database or isolated schema.

Do not modify Dograh's internal database tables.

Propose and implement these logical tables:

### customers_memory
- customer_id
- finance_company_id
- preferred_language
- preferred_call_time
- compact_customer_summary
- last_disposition
- last_call_at
- interaction_count
- updated_at

### call_sessions
- call_id
- customer_id
- started_at
- ended_at
- call_status
- language_used
- disposition
- duration_seconds

### call_summaries
- id
- call_id
- customer_id
- summary
- customer_response_summary
- commitment_summary
- created_at

### payment_promises
- id
- customer_id
- call_id
- promised_amount
- promised_date
- promise_status
- verified_at
- created_at

### callback_requests
- id
- customer_id
- call_id
- requested_datetime
- callback_status
- created_at

### customer_interaction_observations
- id
- customer_id
- call_id
- observable_tone
- response_style
- cooperation_level
- customer_concerns
- created_at

These are proposed logical structures. Review the existing database and provide a migration plan before implementing.

Use appropriate indexes, foreign keys, tenant isolation, and data retention rules.

## 5. Memory Loading Strategy

When an outbound call is prepared:

1. Retrieve customer memory before dialing whenever possible.
2. Retrieve the latest 5–6 call summaries.
3. Retrieve outstanding payment promises.
4. Retrieve callback requests.
5. Retrieve preferred language.
6. Retrieve relevant interaction observations.
7. Retrieve current loan facts from the authoritative finance API.

Prepare one compact memory context for the LLM.

Example:

CUSTOMER MEMORY:

Customer: Sanjay Rithik
Language: Tamil/Tanglish
Previous calls: 6

Recent history:
- Call 1: Customer requested one week to arrange payment.
- Call 2: Promised payment on November 8.
- Call 3: Payment was not confirmed.
- Call 4: Requested another two days.
- Call 5: Said payment would be completed by 6 PM.
- Call 6: Payment still pending; customer requested a WhatsApp payment QR.

Current verified payment status:
- Outstanding: Fetch from finance API.
- Promise status: Not fulfilled, if verified.
- Latest commitment: Fetch from memory.

Communication observation:
- Previously responded in Tamil/Tanglish.
- Requested short conversations.
- Became frustrated when repeatedly asked the same question.

The agent should use this information naturally.

Example next-call response:

"ஹலோ சார், நான் செந்தூர் ஃபைனான்ஸ்ல இருந்து பேசுறேன். சஞ்சய் ரித்திக் பேசுறீங்களா?"

After identity confirmation:

"சார், போன தடவை 6 மணிக்குள்ள payment பண்ணுறேன்னு சொல்லியிருந்தீங்க. இன்னும் payment update வரல. என்ன ஆச்சு சார்?"

Do not blindly trust old payment promises. Always verify the latest payment status before discussing outstanding amounts.

## 6. Token Reduction Strategy

Implement a hierarchical memory system:

LEVEL 1 — Current conversation:
Keep the recent turns required for the active call.

LEVEL 2 — Recent call memory:
Load the last 5–6 compact call summaries.

LEVEL 3 — Customer profile:
Keep a small, continuously updated summary of stable preferences and relevant history.

LEVEL 4 — Detailed history:
Retrieve older call summaries or transcripts only when a specific question requires them.

Rules:
- Never send all historical transcripts to the LLM.
- Do not duplicate information across memory sections.
- Remove outdated and superseded promises from active memory.
- Preserve historical records for audit where required.
- Use structured JSON for promises, dates, callbacks, and dispositions.
- Keep summaries concise.
- Use configurable context/token budgets.
- Measure actual token consumption before and after optimization.

Do not let memory summaries become the authoritative source for financial balances.

---

# PHASE 3 — CUSTOMER LANGUAGE AND INTERACTION BEHAVIOR

## 7. Language Memory

Store the customer's preferred language.

Supported languages:
- Tamil
- Tanglish
- English
- Hindi/Hinglish
- Telugu

Detect language during every call.

If a customer consistently prefers Tanglish, future calls should begin in natural Tanglish.

If the customer switches languages, adapt to the current conversation.

Store the confirmed or frequently used language preference.

## 8. Customer Response Observations

Record observable communication behavior from every call.

Examples:
- Calm and cooperative.
- Frustrated about repeated calls.
- Asked for more time.
- Requested a human representative.
- Could not speak because of work.
- Explained a medical or financial difficulty.
- Repeatedly changed the proposed payment date.

Do not automatically conclude that the customer is intentionally avoiding payment.

Distinguish:
- What the customer actually said.
- What the AI inferred.
- What remains uncertain.

Do not store unsupported psychological or personality labels.

Use these observations to improve the next conversation.

---

# PHASE 4 — INTELLIGENT COLLECTION QUESTIONING

## 9. Finance Collection Questioning Strategy

The agent must be good at asking relevant questions.

Its main objective is to understand why payment is pending and obtain a realistic payment commitment.

Examples:

If the customer cannot pay:
"சார், புரியுது. அப்போ உங்களால் எப்போ payment arrange பண்ண முடியும்?"

If the customer requests more time:
"சரிங்க சார், எந்த தேதிக்குள்ள கட்ட முடியும்?"

If the customer cannot pay the full amount:
"முழு amount இப்போ முடியலன்னா, முதல்ல ஒரு part payment பண்ண முடியுமா? அதற்கான option இருக்கான்னு பார்க்கலாம்."

If multiple EMIs are overdue:
"சார், மொத்தம் மூணு EMI pending-ல இருக்கு. முதல்ல எதை எவ்வளவு கட்ட முடியும்?"

If the customer says payment was already made:
Do not ask them to pay again. Trigger payment verification.

If the customer is angry:
"சரி சார், உங்க பிரச்சனை புரியுது. அதை எப்படி resolve பண்ணலாம்னு பார்க்கலாம்."

Ask only one clear question at a time.

Do not continue asking payment questions when the customer is unavailable, has refused contact, or requires a human representative.

## 10. Collection Policy and Vehicle Repossession

The agent must never invent legal consequences or threaten customers.

Vehicle repossession information may only be communicated when:
- The relevant loan status is verified.
- The company has authorized the communication.
- The applicable agreement and recovery process support the statement.
- The exact wording has been approved by compliance.

Never falsely claim that a vehicle is already on a seizure list.

Never use threats, intimidation, humiliation, or repeated aggressive questioning.

If the customer requests more time or disputes the amount, follow the approved escalation process.

---

# PHASE 5 — WHATSAPP PAYMENT ACTIONS

## 11. WhatsApp Payment QR

During a conversation, the agent may offer to send payment details through WhatsApp.

Example:

"சார், உங்க payment details WhatsApp-ல அனுப்பட்டுமா?"

If the customer agrees:

1. Call the Python action controller.
2. Verify customer identity and phone number.
3. Fetch the current outstanding amount from the finance API.
4. Generate or retrieve the authorized dynamic payment QR.
5. Send the QR using WhatsApp Cloud API.
6. Record the message ID and delivery status.
7. Return the result to the LLM.

The agent must only say that the QR was sent after the backend confirms successful submission.

Never generate arbitrary UPI payment destinations or modify payment amounts without backend authorization.

---

# PHASE 6 — CALLBACK AND PAYMENT PROMISE MEMORY

## 12. Separate Payment Promise and Callback

These are two different intents.

Example:

"I will pay after one week."

Action:
- Extract payment commitment date.
- Save payment promise.
- Schedule a follow-up only according to approved business policy.

Example:

"Call me tomorrow at 6 PM."

Action:
- Extract callback date and time.
- Confirm timezone.
- Create callback request.
- Schedule a new outbound call using a Python worker.

Do not treat every payment promise as permission for an immediate callback.

Use Redis for queue processing and persistent PostgreSQL records for callback state.

Implement retries, idempotency, and failure logging.

---

# PHASE 7 — EMOTIONAL AND NATURAL VOICE QUALITY

## 13. Emotion-Aware Conversation

The agent should adapt its response style to observable customer behavior.

Examples:

Calm customer:
Use a normal, friendly tone.

Angry customer:
Remain calm, acknowledge the concern, and avoid arguing.

Customer explaining a genuine difficulty:
Acknowledge the situation and ask a realistic follow-up question.

Customer making a promise:
Respond with a natural confirmation.

Customer joking:
A light, professional response is acceptable when appropriate.

Do not fake emotions or use exaggerated laughter.

Keep the agent respectful and professional.

## 14. TTS-Friendly LLM Output

The LLM must generate speech-ready responses.

Rules:
- Output only the actual spoken response.
- No Markdown headings.
- No bullet points.
- No JSON in spoken dialogue.
- No emojis.
- No arrows or decorative symbols.
- Avoid unnecessary exclamation marks.
- Use natural Tamil punctuation and short sentence breaks.
- Normalize dates and amounts for speech.
- Do not read technical terms or internal tool names aloud.
- Keep most responses to one or two short sentences.
- Never sacrifice clarity to meet a fixed word limit.

The TTS must sound conversational rather than like a newsreader.

Inspect supported Sarvam TTS controls in the pinned Pipecat version before changing voice pace, buffering, or prosody.

---

# PHASE 8 — LOW LATENCY

## 15. First Greeting and Response Latency

Current observed delay: approximately 5–6 seconds.

Target: reduce unnecessary silence and improve first-response time.

Requirements:
- Preload customer memory before dialing.
- Prepare the opening greeting before the call connects.
- Use a short, deterministic opening greeting.
- Avoid an LLM request before the first greeting when it is unnecessary.
- Start processing customer speech immediately.
- Tune VAD and turn detection.
- Optimize STT finalization.
- Stream LLM responses.
- Stream TTS audio.
- Support barge-in.
- Avoid loading old transcripts during an active turn.

Measure:
- Call answer to first greeting audio.
- Customer speech end to first AI response audio.
- STT finalization latency.
- LLM first-token latency.
- TTS first-audio latency.
- End-to-end turn latency.

Do not blindly change undocumented parameters. Verify every setting against the exact pinned Dograh/Pipecat version.

---

# PHASE 9 — FUTURE SPEAKER RECOGNITION

Do not implement speaker recognition in this phase.

Do not store voiceprints or raw audio for speaker identification.

Keep the memory architecture extensible so a future SpeechBrain ECAPA-TDNN integration can be added with explicit consent and appropriate security controls.

For now, use customer ID and normal identity confirmation.

---

# PHASE 10 — IMPLEMENTATION AND TESTING

Before modifying anything:

1. Inspect the complete existing workspace.
2. Inspect current prompts and prompt builder.
3. Inspect Dograh workflow configuration.
4. Inspect existing Sarvam integration.
5. Inspect the current PostgreSQL and Redis setup.
6. Inspect existing WhatsApp integration.
7. Identify all existing features that must remain unchanged.

Then propose:
- Updated architecture diagram.
- Database schema and migrations.
- Memory retrieval strategy.
- Memory summarization strategy.
- Python API endpoints.
- Callback worker design.
- Dograh integration changes.
- Prompt changes.
- Token and latency measurement plan.

Implement only after explaining the database and migration plan.

Test scenarios:
1. First-time customer call.
2. Customer identity confirmation.
3. Customer says payment will be made in one week.
4. Customer promises payment at 6 PM.
5. Customer misses the promised payment.
6. Customer says payment is already completed.
7. Customer requests partial payment.
8. Customer requests a WhatsApp QR.
9. Customer is angry.
10. Customer explains a medical or financial difficulty.
11. Customer asks for a human manager.
12. Another person answers the call.
13. Customer speaks in Tanglish and switches to English.
14. Customer requests a callback.
15. The next call uses the previous 5–6 call summaries correctly.

Measure naturalness, memory accuracy, factual accuracy, token consumption, and response latency.

## Final Restrictions

- Preserve the existing Dograh + Vobiz + Sarvam architecture.
- Do not implement SpeechBrain speaker recognition now.
- Do not send all previous transcripts to the LLM.
- Do not use unverified financial data.
- Do not expose secrets.
- Do not invent payment commitments.
- Do not create false vehicle seizure warnings.
- Never misrepresent the agent's identity.
- Do not modify unrelated modules.
- Do not deploy to production without approval.

Work in phases. First provide the architecture and database migration proposal. Wait for my approval before implementing database changes.

The final objective is an intelligent, memory-enabled, natural Tamil/Tanglish finance collection voice agent that remembers customers, understands their situations, asks the right questions, and reduces unnecessary LLM token usage.