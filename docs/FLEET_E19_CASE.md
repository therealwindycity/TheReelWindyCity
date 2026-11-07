# E-19-26: award established; delivery and actual payment unverified

**Case reviewed November 2, 2026.** One Traffic Division pickup procurement,
not a finding about every fleet purchase or the City's overall finances.

## Finding in plain English

The records identify **Fremont Motor Company, Lander, Wyoming—not Duval Ford in
Florida—as the approved supplier**, with an award cap of **$78,819**.
May 11 was a referral, not the final award: the actual approval was **May 26,
2026**. The memo identifies account **020-26-2617-42-43503**, labeled
**2019–2022 Optional 1% Sales Tax Fund**.

The extracted bid table lists Duval at $75,412 and a 105% comparison figure.
The approved $78,819 is $3,407, or approximately **4.52%**, above that lower bid
and $363.60 below its 105% benchmark. That is consistent with a resident-preference
price comparison, **not proof that all legal eligibility requirements were met**.
The underlying residency certification, purchasing authority and RAM rejection
record remain to be examined.

**The missing link is actual performance and payment:** no purchase order,
executed contract, delivery acceptance, matched invoice or disbursement has been
established for this transaction. Do not describe the award cap as money paid.

## 1. Direct source record and chronology

| Date / stage | What the document establishes | Primary source |
|---|---|---|
| May 6 — recommendation | Two bidders; Fremont submitted RAM, Chevrolet and Ford options. RAM was rejected. Staff recommended $78,819; declined trade-in of Block #5826; identified account 020-26-2617-42-43503. | [Purchasing memo, PDF page 1](https://cheyenne.granicus.com/MetaViewer.php?view_id=5&clip_id=1095&meta_id=147788#page=1) |
| May 11 — referral | E-19-26 was referred to Finance Committee. This is not final award approval. | [May 11 minutes, PDF page 5](https://cheyenne.granicus.com/DocumentViewer.php?file=cheyenne_1b5f3a311e32525a4736e29063de632c.pdf&view=1#page=5) |
| May 26 — award | The consent-agenda motion carried, accepting Fremont's bid in an amount not to exceed $78,819 for the Traffic Division pickup. Fund identified as 2019–2022 Optional 1% Sales Tax Fund. | [May 26 minutes, PDF page 6](https://cheyenne.granicus.com/DocumentViewer.php?file=cheyenne_b637d92a1037156e574e001679dfa832.pdf&view=1#page=6) |
| After award — performance/payment | Not established by the records reviewed. | Invoice, receiving and payment records required; see request below. |

The May 26 minutes [page 1](https://cheyenne.granicus.com/DocumentViewer.php?file=cheyenne_b637d92a1037156e574e001679dfa832.pdf&view=1#page=1)
say White moved and Segrave seconded approval of the remaining consent items,
and record “Voting ‘yes’ – all members of the governing body.” Page 6 explicitly
marks this bid `[CA]` and records its disposition. This is a collective consent
record, not a separate named roll call on E-19-26. No individual vote rows were
manufactured from the attendance roster.

The fund's 2019–2022 label alone does not establish expiration or an improper
2026 expenditure. That requires the authorizing instrument, budget and applicable
carryforward restrictions. Do not silently relabel this fund as SPET.

## 2. Bid comparison and limits

The [bid tabulation, PDF page 2](https://cheyenne.granicus.com/MetaViewer.php?view_id=5&clip_id=1095&meta_id=147788#page=2)
contains four price columns. Native extracted text gives:

| Bidder / option | Listed price | Recorded treatment |
|---|---:|---|
| Duval Ford | $75,412 | Non-resident bidder |
| Fremont — RAM | $76,809 | Rejected / non-compliant with bid requirements |
| Fremont — Chevrolet | $78,819 | Requested award; memo identifies Chevrolet as next lowest responsive option |
| Fremont — Ford | $82,119 | Higher option |

The extraction duplicates unit and total amounts because the quantity is one.
Do not sum those duplicate cells as separate vehicles. The memo explicitly
confirms the chosen Chevrolet option and $78,819 recommendation. Page 2's native
layout-mode extraction was empty; the table has not been independently
image-reviewed here. Its original PDF is retained in the hosted artifact and is
linked above. Numerical column interpretation is based on extracted table order,
headers and the corroborating narrative memo, not an OCR confidence score.

Recomputed with decimal arithmetic:

```text
78,819.00 − 75,412.00                = 3,407.00
3,407.00 / 75,412.00 × 100           = 4.517849…%
75,412.00 × 1.05                    = 79,182.60
79,182.60 − 78,819.00               = 363.60
```

This explains why a price above the lowest sticker price warrants examination
of preference rules rather than an immediate accusation. The tabulation's 105%
figure is evidence of a comparison being presented, not an independent legal
opinion validating its use. A Wyoming address alone does not establish statutory
resident eligibility. The actual RAM specification failure also needs the
underlying written record.

The City declined the trade-in. Do not subtract the displayed $7,000/$10,000
trade offers from the award cap and report an invented net payment.

## 3. Actual-payment search: useful negative result, incomplete coverage

I searched the matching archived `civic.db` voucher-report pages, read-only:

- **61 voucher documents / 721 extracted pages** in the limited local archive;
- 13 reports / 154 metadata-counted pages associated with meeting-index dates
  from May 26 through September 14, 2026;
- exact E-19-26 identifier variants, $78,819/78819 variants and Fremont name
  variants allowing whitespace/hyphens;
- **zero exact bid-ID or amount matches** in those voucher pages;
- zero Fremont-name matches in reports indexed on/after May 26.

Earlier Fremont entries concern other purchases, including **E-19-25**, which
must not be joined to E-19-26 merely because the vendor and bid-number stem match.

**This does not establish nonpayment.** The archive is not a complete ledger,
meeting-index dates are not independently verified payment dates, extracted text
can miss content, and reports after September 14 through the November 2 review
cutoff are not covered. A later delivery/payment, differently indexed supplier,
credit, combined invoice or inaccessible record remains possible. No paid-date,
paid-amount or bank-clearing conclusion is drawn.

Machine-readable search patterns, source database hash, document coverage and
hit excerpts are in `archived_payment_search.json` in the local case bundle.

## 4. Exact evidence needed to close the transaction

| Open question | Record that would answer it |
|---|---|
| Why was the RAM option rejected? | Original specifications, submitted RAM bid and written responsiveness/rejection analysis |
| Was preference correctly available? | Bidder eligibility/residency certification; purchasing rule/statute relied on; signed evaluation and preference worksheet |
| What obligation was executed? | Purchase order, signed agreement, accepted quotation and amendments/change orders |
| Was the specified truck received? | Delivery date, receiving/inspection acceptance, equipment description, VIN/asset record and discrepancy notices |
| What was invoiced and paid? | Vendor invoice, AP voucher, check/EFT reference, payment date/amount, credits, cancellations and outstanding balance |
| Which account actually bore the cost? | Fund/account-coded expenditure and correcting/reclassification journal entries tied to that PO/invoice |
| What happened to Block #5826? | Trade-in rejection record and subsequent asset transfer/disposal record |

The key reconciliation is **bid → award → PO/contract → received asset → invoice
→ payment → fund posting**, using actual identifiers. Matching only a vendor name
and similar amount is not sufficient.

## 5. Ready-to-send records request — draft, not sent

**To:** City Clerk / Purchasing / Treasurer–Accounts Payable, City of Cheyenne  
**Subject:** Existing records for Bid E-19-26, Traffic Division pickup

Please provide electronic copies of existing records for Bid E-19-26, the
Traffic Division pickup approved May 26, 2026 for Fremont Motor Company of
Lander, Wyoming, in an amount not to exceed $78,819. The May 6 purchasing memo
identifies account 020-26-2617-42-43503 and declines the trade-in of Block #5826.

The requested record set is:

1. Final specifications, all bid submissions and tabulation; the written basis
   for rejecting the Fremont RAM option; any clarification or evaluation records.
2. Resident-bidder certification/eligibility records, the preference calculation,
   and the purchasing policy or statutory provision relied on for the award.
3. Executed purchase order/contract, accepted quote and all amendments or changes.
4. Delivery, receiving and inspection/acceptance records, including fleet asset
   identification and any substitution or deficiency documentation.
5. All invoices, AP vouchers, check/EFT transaction references, payment dates and
   amounts, credits/refunds/cancellations and any open encumbrance or unpaid
   balance associated with this procurement through November 2, 2026.
6. Related fund/account-coded expenditure and correcting journal entries, and
   records of the subsequent disposition or internal transfer of Block #5826.

Please include the bid, PO, invoice and voucher identifiers needed to associate
these records. Existing exports are acceptable; no new analytical report is
requested. Bank account/routing numbers, authentication data and unrelated
personal information are not requested. Please provide public portions of
partially withheld records and identify the basis for any withholding. Please
advise of any anticipated charges before incurring them.

This is a proposed request only. No email was sent, no fee was authorized and no
response deadline is claimed to have started.

## 6. Capture, integrity and reproduction

Successful original-source capture:
[GitHub Actions run 41443951478](https://github.com/therealwindycity/TheReelWindyCity/actions/runs/41443951478),
commit `1b27eff82756a7a5443e72758acc6814b33405dc`.
All three freshly captured PDF SHA-1 digests matched the pre-existing archive's
recorded raw-file digests. This is a byte comparison, not independent corroboration
of the documents' assertions. SHA-256 digests are also retained.

| Source | Bytes | SHA-256 |
|---|---:|---|
| May 6 memo/tabulation | 379,174 | `eda4e0805367ab820bdea2b4f833fa55011e9ea819070a2b98247a243661b78d` |
| May 11 minutes | 130,499 | `cce46f6d4e70397302df9ca194a2d51fa0bc15ba0e50398f05a2106f3040c923` |
| May 26 minutes | 139,502 | `3f19d35fce881704342f6f73ddcf6e26e687c3975de316370aa0bfa3f820a86a` |

Hosted artifact: `fleet-case-41443951478`, ID **13142045049**, containing the
three originals and full extracted source report. It expires November 16, 2026.
The local bundle contains verified selected-page text and API metadata, **not
copies of the original PDFs**; hosted artifact upload was confirmed, but the
artifact archive was not downloaded into this sandbox.

GitHub retains only ten notice annotations per step. An initial capture produced
more notices than that limit. The subsequent transport was corrected to fail
closed on overflow; this successful run's **six of six packets** were reassembled
and verified locally against payload SHA-256
`1dc4d313aa4c37f8528b71d750f773f8040834ac0c0ae5cc9238a9e4db68bf67`.
A truncated packet sequence is not accepted as complete evidence.

Capture tool: `tools/fleet_case_evidence.py`; workflow:
`.github/workflows/fleet-case-evidence.yml`. Only three fixed public records are
requested, redirects are same-host HTTPS only, response bodies are capped at
5 MiB, PDFs at 20 pages, and extracted text at 150,000 characters per source.
Limits are not a fixed-RAM guarantee for malicious PDF parsing; the hosted job
also has a six-minute outer timeout. Source scripts and databases are not seeded
or altered. Failure does not silently become a compliance finding.

Eleven focused tests and 57 civic regression tests passed locally. The focused
suite includes valid byte-preserved PDF capture, malformed/blank PDF isolation,
URL restrictions, ambiguous viewers, packet tampering and notice-budget overflow.

```sh
.venv/bin/python -m unittest discover -s tools -p 'test_fleet_case_evidence.py' -v
# Requires municipal-network access; GitHub-hosted workflow provides that here:
.venv/bin/python tools/fleet_case_evidence.py
```

No video timestamp was verified and no authentic meeting clip was produced.
The earlier supplied May 11 timestamp must not be represented as the May 26 award.
These findings rest on the linked written records, not an invented quotation or
speech-to-vote score.

**Bottom line:** a Wyoming-vendor award and its funding designation are established;
the price comparison has a plausible preference explanation; legal eligibility,
delivery and actual disbursement remain open. The original out-of-state-award
framing is not supported for this particular bid.
