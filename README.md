# Sanctuary v7.0: Legal-Technical Architecture & Defense Posture

## 1. Executive Summary
Sanctuary is a local-first, offline-isolated community health records platform engineered for the Pride Center of Maryland. It is designed to proactively enforce the **Technical Incapacity Defense**. 

By cryptographic and architectural necessity, the developers, operators, and hosting providers of Sanctuary are technically incapable of producing readable Protected Health Information (PHI) under subpoena, because no readable PHI or usable encryption keys are ever transmitted to or stored on centralized servers.

## 2. Technical Incapacity Defense
The legal posture relies on mathematical impossibility. 
- **No Server-Side Plaintext**: The server never holds client data in plaintext. 
- **No Server-Side Keys**: The server never receives the decryption keys.
- **No Cloud-Convenience Fallbacks**: Features like "magic links", SMS OTPs, or server-side password resets are intentionally omitted. If an operator loses their local passphrase, the local encrypted data is cryptographically irretrievable.
- **USB Dead-Man's Switch**: A designated USB key triggers a vault lock or wipe of session keys.

**Forensic Auditability**: A forensic reviewer examining the compiled Tauri/Rust binary and network traffic will mathematically confirm that there are no code paths that transmit readable PHI outside the local machine. 

## 3. Dual-Vault Architecture (DVUA)
To balance operational necessity with extreme privacy, Sanctuary implements a strict Dual-Vault Architecture. 

* **Vault A (General)**: Contains operational data (scheduling, non-sensitive case notes, general program enrollment).
* **Vault B (Sensitive / BridgeVault)**: Contains highly sensitive records governed by 42 CFR Part 2 (substance use disorder treatment), the Maryland Trans Shield Act (HB646/SB460), HRT/medical transition data, immigration status, and HIV status.

### Cryptographic Separation
Vaults A and B are encrypted using **AES-256-GCM**. The keys for each vault are derived from the same operator passphrase using **PBKDF2 (600,000 iterations minimum)**. Compromise of the Vault A key does not expose Vault B.

### BridgeVault Closure (Panic Lock)
Operators can trigger an explicit, immediate closure of Vault B while leaving Vault A open. This allows general clinic operations to continue in supervised or shared-device environments without risking accidental or compelled exposure of Vault B data.

## 4. Compliance & Policy Gates
* **Maryland Trans Shield Act (HB646/SB460)**: All schemas touching gender-affirming care and gender marker history are hardcoded to Vault B. 
* **42 CFR Part 2**: Substance use disorder records are mathematically consent-gated.
* **HRT "No-Interruption" Tracking**: Medication tracking for hormone therapy is isolated in Vault B.
* **Jitsi BAA Enforcement**: Telehealth strictly requires a BAA-compliant Jitsi instance. No silent fallbacks to public servers.

## 5. Web Hardening & Attack Surface Reduction
* **Single-File HTML Architecture**: Where feasible, modules are compiled into single-file HTML documents.
* **Content Security Policy (CSP)**: Strict `default-src 'none'` policies. No remote scripts.
* **Hostile Input Default**: Every text field is treated as hostile and sanitized before rendering.

## 6. Judgment Calls & Trade-offs
* *Trade-off*: We sacrifice cloud synchronization and multi-device seamless syncing to guarantee the Technical Incapacity Defense.
* *Trade-off*: If an operator forgets their master passphrase, the data is unrecoverable. 
* *Trade-off*: Telehealth relies exclusively on a configured BAA-compliant Jitsi instance.
