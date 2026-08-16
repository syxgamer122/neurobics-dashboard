# Security & Vulnerability Disclosure Policy

At MindGem, we take the security of our players, their data, and our competitive leaderboard seriously. We welcome reports from security researchers and developers who find vulnerabilities in our platform.

## Scope

The following domains and services are in scope:
- The main web application (frontend)
- Supabase Edge Functions (`/server/*`)
- Database Row Level Security (RLS) policies
- Scoring and Anti-Cheat algorithms

### Out of Scope
- Denial of Service (DoS/DDoS) attacks.
- Social engineering (phishing, vishing) against MindGem staff or players.
- Physical security testing.
- Third-party vendor vulnerabilities (e.g., Cloudflare Turnstile, Supabase infrastructure) unless they are caused by our misconfiguration.

## Safe Harbor (No Prosecution)
If you conduct your research in good faith and comply with this policy, we consider your actions to be authorized. We will not initiate or support any legal action or law enforcement investigation against you related to your research. 

To maintain this safe harbor, you must:
1. Make every effort to avoid privacy violations, degradation of user experience, disruption to production systems, and destruction or manipulation of data.
2. Only use your own accounts or test accounts for security research. **Do not attempt to access, modify, or delete another user's data.**
3. Give us a reasonable amount of time to resolve the issue before disclosing it publicly or sharing it with others.

## How to Report a Vulnerability
Please email your findings to **security@mindgem.local**.

Include the following in your report:
- A clear description of the vulnerability.
- Step-by-step instructions to reproduce the issue (proof of concept, scripts, or screenshots are highly appreciated).
- The potential impact of the vulnerability.

## Service Level Agreement (SLA)
We strive to meet the following response times for reports submitted to us:
- **Initial Response:** Within 2 business days.
- **Triage and Assessment:** Within 5 business days.
- **Resolution:** Varies depending on severity and complexity (usually within 14-30 days for Critical/High issues).

Thank you for helping keep the MindGem community safe and fair!
