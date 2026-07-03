#!/usr/bin/env python3
"""IRN Resource PDF Generator — all 18 fully built-out, IRN-branded resources."""
import os
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak, ListFlowable, ListItem
)

GOLD      = colors.HexColor('#C9A84C')
EMBER     = colors.HexColor('#C05A3E')
FOREST    = colors.HexColor('#4D6B53')
DARK      = colors.HexColor('#0E0C0B')
DARK2     = colors.HexColor('#1E1B18')
OFF_WHITE = colors.HexColor('#F6F4EE')
MUTED     = colors.HexColor('#9A9382')
GREEN     = colors.HexColor('#15803D')
RED       = colors.HexColor('#B91C1C')
BLUE      = colors.HexColor('#1D4ED8')
OUT_DIR   = os.path.dirname(os.path.abspath(__file__))

def base_styles():
    s = getSampleStyleSheet()
    s.add(ParagraphStyle('IRNTitle',     fontName='Helvetica-Bold',   fontSize=22, textColor=OFF_WHITE, leading=28, spaceAfter=4))
    s.add(ParagraphStyle('IRNSubtitle',  fontName='Helvetica',        fontSize=11, textColor=MUTED,     leading=16, spaceAfter=12))
    s.add(ParagraphStyle('IRNHeading',   fontName='Helvetica-Bold',   fontSize=13, textColor=GOLD,      leading=18, spaceAfter=5, spaceBefore=12))
    s.add(ParagraphStyle('IRNHeading2',  fontName='Helvetica-Bold',   fontSize=10, textColor=OFF_WHITE, leading=14, spaceAfter=3, spaceBefore=8))
    s.add(ParagraphStyle('IRNBody',      fontName='Helvetica',        fontSize=9,  textColor=OFF_WHITE, leading=14, spaceAfter=5))
    s.add(ParagraphStyle('IRNBodyMuted', fontName='Helvetica',        fontSize=8,  textColor=MUTED,     leading=12, spaceAfter=4))
    s.add(ParagraphStyle('IRNNote',      fontName='Helvetica-Oblique',fontSize=8,  textColor=MUTED,     leading=12, spaceAfter=4))
    s.add(ParagraphStyle('IRNLabel',     fontName='Helvetica-Bold',   fontSize=8,  textColor=GOLD,      leading=11, spaceAfter=2, spaceBefore=6))
    s.add(ParagraphStyle('IRNBullet',    fontName='Helvetica',        fontSize=9,  textColor=OFF_WHITE, leading=13, spaceAfter=2, leftIndent=10))
    s.add(ParagraphStyle('IRNSmall',     fontName='Helvetica',        fontSize=7,  textColor=MUTED,     leading=10))
    return s

def hf(canvas, doc):
    canvas.saveState()
    w, h = letter
    canvas.setFillColor(DARK2); canvas.rect(0, h-50, w, 50, fill=1, stroke=0)
    canvas.setFillColor(GOLD);  canvas.rect(0, h-52, w, 2,  fill=1, stroke=0)
    canvas.setFillColor(GOLD);  canvas.setFont('Helvetica-Bold', 9)
    canvas.drawString(0.5*inch, h-32, 'INJUSTICE REFORM NETWORK')
    canvas.setFillColor(MUTED); canvas.setFont('Helvetica', 7)
    canvas.drawString(0.5*inch, h-44, 'injusticereformnetwork.org  |  Free. Always.')
    canvas.drawRightString(w-0.5*inch, h-32, getattr(doc,'title',''))
    canvas.setFillColor(DARK2); canvas.rect(0, 0, w, 36, fill=1, stroke=0)
    canvas.setFillColor(GOLD);  canvas.rect(0, 36, w, 1, fill=1, stroke=0)
    canvas.setFillColor(MUTED); canvas.setFont('Helvetica', 7)
    canvas.drawString(0.5*inch, 13, '© 2026 Injustice Reform Network | Free to distribute, never for sale | IRNVP@pm.me')
    canvas.drawRightString(w-0.5*inch, 13, f'Page {doc.page}')
    canvas.restoreState()

def mkdoc(fname, title):
    p = os.path.join(OUT_DIR, fname)
    d = SimpleDocTemplate(p, pagesize=letter,
        leftMargin=0.6*inch, rightMargin=0.6*inch,
        topMargin=0.85*inch, bottomMargin=0.65*inch,
        title=title, author='Injustice Reform Network')
    d.title = title
    return d

def cover(s, title, sub, acc=GOLD):
    return [Spacer(1,0.08*inch), Paragraph(title, s['IRNTitle']),
            HRFlowable(width='100%', thickness=1.5, color=acc, spaceAfter=5),
            Paragraph(sub, s['IRNSubtitle']), Spacer(1,0.08*inch)]

def sec(s, heading, items):
    out = [Paragraph(heading, s['IRNHeading'])]
    for b in items:
        out.append(Paragraph(b, s['IRNBody']) if isinstance(b, str) else b)
    return out

def bul(s, items):
    return ListFlowable([ListItem(Paragraph(i, s['IRNBullet']), bulletColor=GOLD, bulletText='*') for i in items],
                        bulletType='bullet', leftIndent=12, spaceAfter=3)

CW = letter[0] - 1.2*inch

def lvt(s, rows, cw=None):
    data = [[Paragraph(r[0], s['IRNLabel']), Paragraph(r[1], s['IRNBody'])] for r in rows]
    cw = cw or [1.6*inch, CW-1.6*inch]
    t = Table(data, colWidths=cw)
    t.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,-1),DARK2),
        ('ROWBACKGROUNDS',(0,0),(-1,-1),[DARK2,colors.HexColor('#252220')]),
        ('GRID',(0,0),(-1,-1),0.25,colors.HexColor('#2e2b28')),
        ('VALIGN',(0,0),(-1,-1),'TOP'),
        ('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5),
        ('LEFTPADDING',(0,0),(-1,-1),7),('RIGHTPADDING',(0,0),(-1,-1),7),
    ]))
    return t

def cbt(s, items, cols=2):
    rows, row = [], []
    for item in items:
        row.append(Paragraph(f'[ ]  {item}', s['IRNBody']))
        if len(row)==cols: rows.append(row); row=[]
    if row:
        while len(row)<cols: row.append(Paragraph('',s['IRNBody']))
        rows.append(row)
    cw = CW/cols
    t = Table(rows, colWidths=[cw]*cols)
    t.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,-1),DARK2),
        ('ROWBACKGROUNDS',(0,0),(-1,-1),[DARK2,colors.HexColor('#232120')]),
        ('GRID',(0,0),(-1,-1),0.2,colors.HexColor('#2e2b28')),
        ('VALIGN',(0,0),(-1,-1),'TOP'),
        ('TOPPADDING',(0,0),(-1,-1),4),('BOTTOMPADDING',(0,0),(-1,-1),4),
        ('LEFTPADDING',(0,0),(-1,-1),7),('RIGHTPADDING',(0,0),(-1,-1),7),
    ]))
    return t

def flt(s, headers, rows):
    data = [[Paragraph(h, s['IRNLabel']) for h in headers]]
    for r in rows:
        data.append([Paragraph(str(c), s['IRNBody']) for c in r])
    cw = CW/len(headers)
    t = Table(data, colWidths=[cw]*len(headers), repeatRows=1)
    t.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,0),DARK),
        ('BACKGROUND',(0,1),(-1,-1),DARK2),
        ('ROWBACKGROUNDS',(0,1),(-1,-1),[DARK2,colors.HexColor('#232120')]),
        ('TEXTCOLOR',(0,0),(-1,0),GOLD),
        ('TEXTCOLOR',(0,1),(-1,-1),OFF_WHITE),
        ('GRID',(0,0),(-1,-1),0.25,colors.HexColor('#2e2b28')),
        ('VALIGN',(0,0),(-1,-1),'TOP'),
        ('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5),
        ('LEFTPADDING',(0,0),(-1,-1),6),('RIGHTPADDING',(0,0),(-1,-1),6),
    ]))
    return t

def nb(s, txt):
    t = Table([[Paragraph(f'NOTE: {txt}', s['IRNNote'])]], colWidths=[CW])
    t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),colors.HexColor('#1a160f')),
        ('LEFTPADDING',(0,0),(-1,-1),9),('RIGHTPADDING',(0,0),(-1,-1),9),
        ('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7),
        ('BOX',(0,0),(-1,-1),1,GOLD)]))
    return t

def tb(s, txt):
    t = Table([[Paragraph(f'TIP: {txt}', s['IRNNote'])]], colWidths=[CW])
    t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),colors.HexColor('#0c1a10')),
        ('LEFTPADDING',(0,0),(-1,-1),9),('RIGHTPADDING',(0,0),(-1,-1),9),
        ('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7),
        ('BOX',(0,0),(-1,-1),1,GREEN)]))
    return t

def wl(s, lbl=''):
    t = Table([[Paragraph(lbl, s['IRNLabel']), Paragraph('_'*65, s['IRNBody'])]], colWidths=[1.4*inch, CW-1.4*inch])
    t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),DARK2),
        ('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5),('LEFTPADDING',(0,0),(-1,-1),7)]))
    return t

# ─── 1. POWER MAPPING ───────────────────────────────────────────
def pdf_power_mapping():
    s=base_styles(); d=mkdoc('power-mapping-worksheet.pdf','Power Mapping Worksheet'); st=[]
    st+=cover(s,'Power Mapping Worksheet','Map who holds power, who can be moved, and how to win your campaign.')
    st+=sec(s,'1. Campaign Goal',[
        'State your specific, measurable goal in one sentence.',
        wl(s,'Goal:'), Spacer(1,4), wl(s,'Deadline:'), Spacer(1,4), wl(s,'Decision-Maker:')])
    st+=sec(s,'2. Stakeholder Map',[
        'Rate power (1–5) and support for your goal (–2=oppose, 0=neutral, +2=support).',
        flt(s,['Stakeholder/Org','Power (1-5)','Support (-2 to +2)','Relationship to Us','Shift Strategy'],
            [['','','','','']]*8)])
    st+=sec(s,'3. Ally Analysis',['Who are your strongest allies and what do they bring?',
        flt(s,['Ally Name/Org','What They Bring','Our Ask','Point of Contact'],[['','','','']]*5)])
    st+=sec(s,'4. Opposition Analysis',['Who opposes your goal?',
        flt(s,['Opponent','Their Leverage','Vulnerability','Counter-Strategy'],[['','','','']]*3)])
    st+=sec(s,'5. Constituency Base',['Who is directly affected and how do you reach them?',
        flt(s,['Affected Group','Size/Reach','How to Engage','Current Relationship'],[['','','','']]*4)])
    st+=sec(s,'6. Shift Strategy',['What moves can shift neutral stakeholders toward support?',
        flt(s,['Neutral Stakeholder','What Matters to Them','Proposed Move','Timeline'],[['','','','']]*3),
        Spacer(1,6), tb(s,'Focus energy on movable stakeholders — neutral or soft opponents. Hard opponents rarely shift.')])
    st.append(nb(s,'This is confidential organizing material. Do not share with opposition.'))
    d.build(st, onFirstPage=hf, onLaterPages=hf); print('✓ power-mapping-worksheet.pdf')

# ─── 2. BASE-BUILDING FIELD GUIDE ───────────────────────────────
def pdf_base_building():
    s=base_styles(); d=mkdoc('base-building-field-guide.pdf','Base-Building Field Guide'); st=[]
    st+=cover(s,'Base-Building Field Guide','Grow a coalition from 10 to 10,000 — step by step.',EMBER)
    st+=sec(s,'Phase 1 — Identify Your Core (0–30 Days)',[bul(s,[
        'Conduct 1:1 listening sessions with 20–30 community members. Ask: What keeps you up at night?',
        'Identify 5–10 relational leaders — people with existing trust in the community.',
        'Map informal networks: churches, barbershops, community centers, housing developments.',
        'Intake form: name, phone, email, neighborhood, top issue, skills/availability.',
        'Goal: 25 committed members who show up — not 500 names on a list.'])])
    st+=sec(s,'Door-Knocking Script',[lvt(s,[
        ('Opening','"Hi, my name is [NAME] from IRN. We\'re talking to neighbors about [ISSUE]. Have 5 minutes?"'),
        ('The Listen','"What\'s the biggest problem you\'re dealing with in this neighborhood right now?"'),
        ('Connection','"Others we\'ve talked to have the same experience. We\'re organizing to do something about it."'),
        ('The Ask','"Will you come to a meeting next [DAY] at [PLACE]? Keeping it small — about 20 people."'),
        ('The Close','"Can I get your number to remind you? Anyone else on this block I should talk to?"')])])
    st+=sec(s,'Phase 2 — First Meetings (30–60 Days)',[bul(s,[
        'Keep first meetings to 60–90 min, 20–40 people max. Larger is not better.',
        'Use go-around introductions: name, neighborhood, why you came.',
        'Present one specific injustice with evidence — a document, statistic, or story.',
        'Let people speak. Your job is to draw out leadership, not perform it.',
        'End with a specific next step and a specific ask for each person in the room.',
        'Follow up within 48 hours. Attendance drops 50% at meeting #2 without personal follow-up.'])])
    st+=sec(s,'Phase 3 — Volunteer Pipeline',['Build a clear pipeline with defined roles.',
        flt(s,['Role','Commitment','Responsibilities','Next Step'],[
            ['Supporter','1–2 hrs/mo','Sign petitions, attend rallies','Invite to meetup'],
            ['Volunteer','4–8 hrs/mo','Phone bank, flyering, event help','Assign to committee'],
            ['Organizer','10–20 hrs/mo','Leads 1:1s, runs meetings, recruits','Leadership training'],
            ['Chapter Lead','20+ hrs/mo','Campaign ownership, coalition relationships','IRN certification']])])
    st+=sec(s,'Phase 4 — Retention',[bul(s,[
        'Celebrate wins publicly and specifically — name the people who made them happen.',
        'Give people ownership: let them name the campaign, design the flyer, lead the meeting.',
        'Track attendance. Personally call anyone who misses two meetings in a row.',
        'Host at least one social event (cookout, dinner) per quarter.'])])
    st+=sec(s,'Intake Tracker',[flt(s,['Name','Phone','Neighborhood','Top Issue','Role','Status'],[['','','','','','']]*6)])
    st.append(tb(s,'30 committed people beat 300 disengaged ones every time. Build depth, not just breadth.'))
    d.build(st, onFirstPage=hf, onLaterPages=hf); print('✓ base-building-field-guide.pdf')

# ─── 3. CAMPAIGN STRATEGY CHART ─────────────────────────────────
def pdf_campaign_strategy():
    s=base_styles(); d=mkdoc('campaign-strategy-chart.pdf','Campaign Strategy Chart'); st=[]
    st+=cover(s,'Campaign Strategy Chart','Midwest Academy format adapted for IRN campaigns. Complete each column before starting.')
    st+=sec(s,'Goal',[lvt(s,[('Specific Ask',''),('Why Now',''),('Winnable?','Yes / No / Why: ____________'),('Timeline','')])])
    st+=sec(s,'Organizational Considerations',[lvt(s,[('Primary Org',''),('Secondary Orgs',''),
        ('Internal Resources','(staff, volunteers, budget)'),('Gaps to Fill','')])])
    st+=sec(s,'Constituents, Allies & Opponents',[
        flt(s,['Name/Org','Type','Power','Position','Strategy'],[['','','','','']]*6)])
    st+=sec(s,'Tactics',[flt(s,['Tactic','Who Leads','Who Participates','Target','Date','Expected Outcome'],[['','','','','','']]*5)])
    st+=sec(s,'Timeline',[flt(s,['Period','Key Milestone','Who Is Responsible','Status'],[
        ['Week 1','','',''],['Week 2','','',''],['Month 1','','',''],
        ['Month 2','','',''],['Month 3','','',''],['Campaign End','','','']])])
    st+=sec(s,'Success Metrics',[lvt(s,[('Win Condition','What does victory look like?'),
        ('Partial Win','What counts as meaningful progress?'),
        ('Loss Condition','What does losing look like and what is the next move?'),
        ('How We Measure','signatures, turnout, media hits, policy changes')])])
    st.append(nb(s,'Run this chart with your full leadership team — not just staff. Consensus on strategy sustains campaigns.'))
    d.build(st, onFirstPage=hf, onLaterPages=hf); print('✓ campaign-strategy-chart.pdf')

# ─── 4. ESCALATION LADDER ───────────────────────────────────────
def pdf_escalation():
    s=base_styles(); d=mkdoc('escalation-ladder-planner.pdf','Escalation Ladder Planner'); st=[]
    st+=cover(s,'Escalation Ladder Planner','Plan your pressure campaign from internal demand to direct action.',FOREST)
    st.append(Paragraph('Escalate only when the previous rung fails to produce a response. Never skip rungs — it loses credibility.',s['IRNBody']))
    st.append(Spacer(1,6))
    for rung, fields in [
        ('Rung 1 — Internal Demand (Certified Mail)',[
            ('Tactic','Send a formal written demand to the decision-maker via certified mail.'),
            ('Trigger to Escalate','No response within 10 business days OR denial.'),
            ('Who Leads',''), ('Target',''), ('Date Sent',''), ('Response Received','')]),
        ('Rung 2 — Public Petition',[
            ('Tactic','Launch a petition. Collect signatures online and in person. Deliver at a public event.'),
            ('Signature Goal','(minimum before delivery)'), ('Trigger to Escalate','Petition delivered, no substantive response.'),
            ('Launch Date',''), ('Delivery Date',''), ('Signatures Collected','')]),
        ('Rung 3 — Media & Public Pressure',[
            ('Tactic','Press conference, press release, journalist outreach, social media.'),
            ('Media Targets','(local TV, newspapers, radio)'), ('Trigger to Escalate','Coverage with no concession.'),
            ('Press Conference Date',''), ('Media Contacts Reached','')]),
        ('Rung 4 — Rally & Direct Turnout',[
            ('Tactic','Public rally outside the decision-maker\'s office or place of business.'),
            ('Expected Turnout',''), ('Permit Required?','Yes / No — Filed: ____________'),
            ('Trigger to Escalate','Visible public pressure with no concession.'), ('Date',''), ('Actual Turnout','')]),
        ('Rung 5 — Direct Action / Civil Disobedience',[
            ('Tactic','Occupy, blockade, or disrupt operations. Requires legal prep and trained participants only.'),
            ('Legal Observer','(name and contact)'), ('KYR Briefing','Completed: Yes / No'),
            ('Bail Fund Status',''), ('Date','')]),
    ]:
        st+=sec(s,rung,[lvt(s,fields)])
        st.append(Spacer(1,6))
    st+=sec(s,'Negotiation Readiness',[cbt(s,[
        'Clear bottom-line ask defined','Secondary asks identified (bargaining chips)',
        'Who has authority to make concessions','Who speaks for our side (limit 2–3)',
        'What we will NOT accept','Document everything — record or take notes',
        'Pre-agreed decision process with base','Post-negotiation debrief scheduled'])])
    st.append(nb(s,'Never enter negotiation without public pressure behind you. Negotiate from strength, not desperation.'))
    d.build(st, onFirstPage=hf, onLaterPages=hf); print('✓ escalation-ladder-planner.pdf')

# ─── 5. FOIA TEMPLATE ───────────────────────────────────────────
def pdf_foia():
    s=base_styles(); d=mkdoc('foia-request-letter-template.pdf','FOIA Request Letter Template'); st=[]
    st+=cover(s,'FOIA Request Letter Template','Virginia, Maryland, DC & North Carolina — jurisdiction-specific templates with legal citations.',EMBER)
    st.append(nb(s,'For high-stakes requests, have an attorney review before sending.'))
    st.append(Spacer(1,8))

    st+=sec(s,'Virginia FOIA (Va. Code § 2.2-3700 et seq.)',[
        '[YOUR NAME]  [ADDRESS]  [DATE]\nFOIA Officer, [AGENCY NAME], [AGENCY ADDRESS]\n\nRE: VIRGINIA FREEDOM OF INFORMATION ACT REQUEST\n\nPursuant to Va. Code § 2.2-3700 et seq., I request the following public records:\n\n[DESCRIBE RECORDS — specific dates, officers, incident numbers, document types]\n\nUnder Va. Code § 2.2-3704(B), you must respond within FIVE (5) WORKING DAYS. If any portion is denied, cite the specific statutory exemption per Va. Code § 2.2-3704(E). I request a fee waiver as disclosure serves the public interest.\n\n[NAME / SIGNATURE / CONTACT]'])
    st+=sec(s,'Maryland PIA (Md. Code, Gen. Prov. § 4-101 et seq.)',[
        '[YOUR NAME]  [DATE]\nCustodian of Records, [AGENCY NAME]\n\nRE: MARYLAND PUBLIC INFORMATION ACT REQUEST\n\nPursuant to Md. Code, Gen. Prov. §§ 4-101 et seq., I request:\n[DESCRIBE RECORDS]\n\nRespond within THIRTY (30) WORKING DAYS per § 4-203. Cite exemptions under § 4-305 or § 4-307 for any withheld records.\n\n[NAME / DATE]'])
    st+=sec(s,'Washington DC FOIA (D.C. Code § 2-531 et seq.)',[
        '[YOUR NAME]  [DATE]\nD.C. Agency FOIA Officer, [AGENCY NAME]\n\nRE: DC FREEDOM OF INFORMATION ACT REQUEST\n\nPursuant to D.C. Code §§ 2-531 through 2-540, I request:\n[DESCRIBE RECORDS]\n\nRespond within FIFTEEN (15) BUSINESS DAYS per § 2-532(c). Provide a Vaughn index for any withheld records per § 2-534.\n\n[NAME / DATE]'])
    st+=sec(s,'North Carolina Public Records (N.C.G.S. § 132-1 et seq.)',[
        '[YOUR NAME]  [DATE]\nRecords Custodian, [AGENCY NAME]\n\nRE: NORTH CAROLINA PUBLIC RECORDS REQUEST\n\nUnder N.C.G.S. § 132-1 et seq., public records belong to the people. I request:\n[DESCRIBE RECORDS]\n\nNC law requires agencies to respond "as promptly as possible." I request response within TEN (10) BUSINESS DAYS. Cite exemptions under N.C.G.S. § 132-1.4 for any withheld records.\n\n[NAME / DATE]'])
    st+=sec(s,'Common Record Types — Suggested Language',[
        flt(s,['Record Type','Suggested Request Language'],[
            ['Body Camera Footage','All body-worn camera footage from incident on [DATE] involving officer(s) [NAME/BADGE] at [LOCATION].'],
            ['Use of Force Reports','All use-of-force reports, supplemental reports, and incident reports for [OFFICER/INCIDENT ID] from [DATE RANGE].'],
            ['Complaint History','All civilian complaints, internal affairs records, and disciplinary records for officer [NAME/BADGE#] — last 5 years.'],
            ['Department Policies','Current written policies, general orders governing use of force, body camera, and stop-and-frisk.'],
            ['Budget Records','Departmental budget, expenditure reports, and grant records for fiscal year [YEAR].']])])
    st.append(tb(s,'Track every request: date sent, agency, tracking number, deadline, response. Follow up by phone on day 4 if no confirmation.'))
    d.build(st, onFirstPage=hf, onLaterPages=hf); print('✓ foia-request-letter-template.pdf')

# ─── 6. KNOW YOUR RIGHTS ────────────────────────────────────────
def pdf_kyr():
    s=base_styles(); d=mkdoc('know-your-rights-police-encounters.pdf','Know Your Rights: Police Encounters'); st=[]
    st+=cover(s,'Know Your Rights: Police Encounters','What you can say, what you must do, and what you can refuse. Know this before you need it.',RED)
    st.append(nb(s,'US rights. Laws vary by state. Educational only — not legal advice. If arrested, request a lawyer immediately and say nothing else.'))
    st.append(Spacer(1,6))
    st+=sec(s,'1. Traffic Stops',[bul(s,[
        'Pull over safely. Keep hands visible on the steering wheel at all times.',
        'You MUST provide: license, registration, and proof of insurance.',
        'You do NOT have to answer questions. Say: "I am not answering questions without a lawyer."',
        'You can refuse a vehicle search. Say: "I do not consent to a search."',
        'If they search anyway — do NOT resist physically. Document everything afterward.'])])
    st+=sec(s,'2. Pedestrian Stops',[bul(s,[
        'Virginia & Maryland: you are NOT required to show ID unless you have been placed under arrest.',
        'If stopped: "Am I free to go?" If yes — leave calmly. If no — you are detained.',
        'If detained: "I am invoking my right to remain silent. I want a lawyer."',
        'Do not run. Do not physically resist even if the stop is unlawful.',
        'After: write down time, location, badge number, exact words — everything you remember.'])])
    st+=sec(s,'3. Home Searches',[bul(s,[
        'Police generally need a warrant to enter your home.',
        'If they knock: "Do you have a warrant?" You do NOT have to open the door.',
        'If they have a warrant — read it. It specifies exactly what they can search.',
        'If they claim emergency — do not block entry but say clearly: "I do not consent to this search."',
        'Do not answer questions during a search. Wait for your lawyer.'])])
    st+=sec(s,'4. If You Are Arrested',[bul(s,[
        'Say: "I am invoking my right to remain silent." Then say NOTHING else.',
        'Say: "I want a lawyer." Repeat this if questioned. Do not waive this right.',
        'Do not resist physically even if you believe the arrest is unlawful.',
        'Do not sign anything without your lawyer.',
        'If you cannot afford a lawyer, one must be appointed at no cost.'])])
    st+=sec(s,'What to Document After Any Police Encounter',[cbt(s,[
        'Date and exact time','Location (full address if possible)',
        'Officer name and badge number','Patrol car / unit number',
        'Exact words spoken (write immediately)','What was done (search, pat-down, etc.)',
        'Names and contacts of witnesses','Photos of injuries',
        'Whether you received a ticket or receipt','File FOIA for body cam footage within 30 days'])])
    st+=sec(s,'Scripts — What to Say',[lvt(s,[
        ('Invoke silence','"I am invoking my right to remain silent."'),
        ('Refuse search','"I do not consent to a search."'),
        ('Request lawyer','"I want a lawyer. I will not answer questions without one."'),
        ('Clarify detention','"Am I free to go? Am I being detained?"'),
        ('As a witness','"I am a witness. I am not interfering. I am recording.\"')])])
    st.append(nb(s,'If you experience misconduct, contact IRN: IRNVP@pm.me — we help file complaints, request records, and connect you with legal support.'))
    d.build(st, onFirstPage=hf, onLaterPages=hf); print('✓ know-your-rights-police-encounters.pdf')

# ─── 7. INCIDENT DOCUMENTATION FORM ────────────────────────────
def pdf_incident():
    s=base_styles(); d=mkdoc('incident-documentation-form.pdf','Incident Documentation Form'); st=[]
    st+=cover(s,'Incident Documentation Form','Document police misconduct or rights violations immediately — within 24 hours while memory is fresh.',RED)
    st.append(nb(s,'Complete within 24 hours. Use exact words when quoting officers. This may be used in legal proceedings.'))
    st.append(Spacer(1,6))
    st+=sec(s,'A — Incident Details',[lvt(s,[
        ('Date',''),('Time (approx.)',''),('Location (full address)',''),
        ('Incident Type','[ ] Traffic stop  [ ] Pedestrian stop  [ ] Home entry  [ ] Arrest  [ ] Use of force  [ ] Other')])])
    st+=sec(s,'B — Officer Information',[
        flt(s,['Officer Name (if known)','Badge Number','Unit / Car #','Supervisor Present'],[['','','',''],['','','','']]),
        Spacer(1,4),
        lvt(s,[('Officer in uniform?','Yes / No'),('Body cam visible?','Yes / No / Unknown'),('Camera activated?','Yes / No / Unknown')])])
    st+=sec(s,'C — Your Information',[lvt(s,[
        ('Your Full Name',''),('Phone / Email',''),
        ('Your Role','[ ] Subject  [ ] Witness  [ ] Bystander'),
        ('Were you injured?','Yes / No — If yes, describe:'),
        ('Medical care sought?','Yes / No — Where:')])])
    st+=sec(s,'D — Narrative (What Happened)',[
        'Describe in your own words, chronologically. Include exact statements.',
        wl(s),wl(s),wl(s),wl(s),wl(s),wl(s),wl(s),wl(s)])
    st+=sec(s,'E — Evidence',[cbt(s,[
        'Video/photo evidence','Audio recording',
        'Medical records obtained','Ticket/citation copy kept',
        'FOIA filed for body cam','Witness statements collected'])])
    st+=sec(s,'F — Witnesses',[flt(s,['Witness Name','Phone/Email','Relationship','What They Saw'],[['','','',''],['','','',''],['','','','']])])
    st+=sec(s,'G — Follow-Up',[lvt(s,[
        ('Complaint filed?','Yes / No — With: ___________  Date: ___________'),
        ('Seeking legal rep?','Yes / No'),
        ('IRN Case Number',''),('Next Steps','')])])
    st.append(Spacer(1,8))
    st.append(Paragraph('Signature: _________________________  Date: ____________', s['IRNBody']))
    st.append(Spacer(1,6))
    st.append(tb(s,'Email a copy to IRNVP@pm.me and keep a physical copy. File FOIA for body cam footage within 30 days — footage is often deleted after that window.'))
    d.build(st, onFirstPage=hf, onLaterPages=hf); print('✓ incident-documentation-form.pdf')

# ─── 8. TENANT RIGHTS ───────────────────────────────────────────
def pdf_tenant():
    s=base_styles(); d=mkdoc('tenant-rights-quick-reference.pdf','Tenant Rights Quick Reference'); st=[]
    st+=cover(s,'Tenant Rights Quick Reference','Virginia landlord-tenant law in plain language. Know this before you get a notice.')
    st.append(nb(s,'Virginia law unless noted. Always read your lease. Educational only — not legal advice. For eviction proceedings, contact a lawyer immediately.'))
    st.append(Spacer(1,6))
    st+=sec(s,'1. Right to Habitable Housing (Va. Code § 55.1-1220)',[bul(s,[
        'Landlord MUST maintain: working heat, hot/cold water, working plumbing, intact roof and windows, pest control.',
        'If landlord fails to repair: give written notice. Landlord has 14 days (24 hrs for emergencies).',
        'If no repair after notice: you may terminate the lease or pursue repair-and-deduct (§ 55.1-1234).',
        'Document everything: photos + dated certified mail notices.'])])
    st+=sec(s,'2. Eviction Protections',[lvt(s,[
        ('Notice Required','Non-payment: 5-day pay-or-quit. Lease violation: 30-day cure notice. Month-to-month: 30 days.'),
        ('Court Required','Landlord CANNOT remove you without a court order. Changing locks or shutting utilities is illegal self-help eviction (§ 55.1-1236).'),
        ('Timeline','After court order: typically 10 days before writ of possession.'),
        ('Legal Aid','Virginia Legal Aid: (800) 393-7910. Apply immediately upon receiving any court notice.')]),
        nb(s,'Never ignore an eviction notice or miss a court date. A default judgment is very difficult to reverse.')])
    st+=sec(s,'3. Security Deposit Rights',[bul(s,[
        'Maximum deposit: 2 months rent (§ 55.1-1226).',
        'Landlord must return within 45 days of move-out with itemized deductions.',
        'If wrongfully withheld: sue for deposit plus damages.',
        'Document unit condition at move-in AND move-out with timestamped photos.'])])
    st+=sec(s,'4. Retaliation Protections (§ 55.1-1246)',[bul(s,[
        'Landlord CANNOT raise rent, reduce services, or file for eviction because you filed a complaint.',
        'Retaliation is presumed if landlord acts within 90 days of your complaint.',
        'If retaliated against: document everything and contact legal aid immediately.'])])
    st+=sec(s,'Key Deadlines',[flt(s,['Situation','Deadline','Required Action'],[
        ['Repair failure','14 days after written notice','Landlord fixes or tenant may terminate'],
        ['Emergency (heat/water)','24 hours','Landlord must act immediately'],
        ['Security deposit return','45 days after move-out','Return + itemized deductions'],
        ['Eviction notice (non-payment)','5 days to pay or vacate','Can still fight in court'],
        ['Eviction court date','Varies','Attend — missing forfeits your case']])])
    st.append(tb(s,'Virginia Rent Relief Program may cover back rent. Apply at HousingForAll.com — even with an eviction notice pending.'))
    d.build(st, onFirstPage=hf, onLaterPages=hf); print('✓ tenant-rights-quick-reference.pdf')

# ─── 9. WRONGFUL CONVICTION INTAKE ──────────────────────────────
def pdf_wrongful():
    s=base_styles(); d=mkdoc('wrongful-conviction-intake-guide.pdf','Wrongful Conviction Intake Guide'); st=[]
    st+=cover(s,'Wrongful Conviction Intake Guide','Initial triage framework for evaluating cases that may warrant innocence investigation.',RED)
    st.append(nb(s,'Initial intake only — not legal advice. All cases must be referred to qualified innocence attorneys. Contact IRNVP@pm.me for referrals.'))
    st.append(Spacer(1,6))
    st+=sec(s,'Part 1 — Basic Intake',[lvt(s,[
        ('Incarcerated Person Name',''),('DOC Number / Location',''),
        ('Contact Submitting Form',''),('Crime Convicted Of',''),
        ('Year of Conviction',''),('Sentence Length',''),
        ('Currently Appealing?','Yes / No — Stage: ________________'),
        ('Trial Type','[ ] Jury  [ ] Judge (bench trial)')])])
    st+=sec(s,'Part 2 — Evidence Review',[cbt(s,[
        'Trial transcripts available','Appellate records available',
        'Physical evidence preserved','DNA evidence exists',
        'Witness statements on record','Original police reports obtained',
        'Defense attorney files reviewed','Lab/forensic reports reviewed',
        'Expert witnesses used at trial','Alibi witnesses available'])])
    st+=sec(s,'Part 3 — Legal Theories to Evaluate',[flt(s,
        ['Legal Theory','Definition','Applies?','Evidence'],
        [['Brady Violation','Prosecution withheld favorable evidence','',''],
         ['Ineffective Assistance','Defense failed to meet basic standards','',''],
         ['New Evidence','Evidence unavailable at trial now available','',''],
         ['False Confession','Confession was coerced or involuntary','',''],
         ['Eyewitness Misidentification','Witness ID was unreliable or coached','',''],
         ['Junk Science','Forensic methods since discredited','',''],
         ['Prosecutorial Misconduct','Prosecutors acted improperly','',''],
         ['Perjured Testimony','Key witness lied at trial','',''],])])
    st+=sec(s,'Part 4 — Referral Pathways',[flt(s,['Organization','Focus','Contact'],[
        ['Virginia Innocence Project','Post-conviction DNA & non-DNA cases','lawschool.richmond.edu/innocence'],
        ['Mid-Atlantic Innocence Project','VA, MD, DC cases','innocenceproject.org'],
        ['MacArthur Justice Center','Police/prison misconduct','macarthurjustice.org'],
        ['Virginia Legal Aid Society','Criminal appeals','(800) 393-7910'],
        ['IRN Legal Network','Case coordination & community support','IRNVP@pm.me']])])
    st+=sec(s,'Part 5 — Case Coordinator Notes',[lvt(s,[
        ('Initial Assessment','[ ] Refer to innocence org  [ ] Needs more info  [ ] Does not meet threshold'),
        ('Priority','[ ] High — time-sensitive appeal  [ ] Medium  [ ] Low'),
        ('Assigned To',''),('Next Steps',''),('Date of Review','')])])
    d.build(st, onFirstPage=hf, onLaterPages=hf); print('✓ wrongful-conviction-intake-guide.pdf')

# ─── 10. POLICE RECORDS REQUEST PACK ────────────────────────────
def pdf_police_records():
    s=base_styles(); d=mkdoc('police-records-request-pack.pdf','Police Records Request Pack'); st=[]
    st+=cover(s,'Police Records Request Pack','Complete templates for body camera footage, use-of-force, complaint histories, and department policies.',RED)
    st+=sec(s,'Template 1 — Body Camera Footage',[
        'Incident Date: ___________  Time: ___________  Location: ___________\nOfficer(s): ___________  Badge #: ___________  Case/Incident #: ___________\n\nI request ALL body-worn camera footage from ALL officers present at this incident, plus any dashboard camera footage. If footage has been deleted, provide documentation of deletion including date and authorization.'])
    st+=sec(s,'Template 2 — Use of Force Report',[
        'I request all use-of-force reports, supplemental reports, supervisor review reports, and any medical records related to:\nIncident Date: ___________  Officer(s): ___________  Location: ___________\n\nInclude: initial report, supervisor review, internal affairs referral (if any), after-action report.'])
    st+=sec(s,'Template 3 — Officer Complaint History',[
        'I request all civilian complaint records, internal affairs investigation records, and disciplinary records for:\nOfficer Name: ___________  Badge #: ___________  Agency: ___________\nDate Range: Last 5 years (or all available)\n\nNote (Virginia): SB 5030 (2020) requires disclosure of certain previously-exempt disciplinary records.'])
    st+=sec(s,'Template 4 — Department Policies',[cbt(s,[
        'Use of Force Policy (current + last 5 years)','Body Camera Policy (activation, retention, access)',
        'Chokeholds / Neck Restraint Policy','Vehicle Pursuit Policy',
        'Protest / Demonstration Response Policy','Misconduct Investigation Policy'],cols=1)])
    st+=sec(s,'Request Tracking Log',[flt(s,['Request #','Agency','Date Sent','Tracking #','Deadline','Response','Appeal?'],[['','','','','','','']*1]*5)])
    st.append(tb(s,'Send all requests via certified mail with return receipt. Keep every copy. If denied, you have the right to appeal — contact IRN for help.'))
    d.build(st, onFirstPage=hf, onLaterPages=hf); print('✓ police-records-request-pack.pdf')

# ─── 11. FINES & FEES RELIEF ────────────────────────────────────
def pdf_fines():
    s=base_styles(); d=mkdoc('fines-fees-relief-roadmap.pdf','Fines & Fees Relief Roadmap'); st=[]
    st+=cover(s,'Fines & Fees Relief Roadmap','Challenge court fines, license suspensions, and garnishment orders step by step.',EMBER)
    st+=sec(s,'Step 1 — Know What You Owe',[bul(s,[
        'Request a complete itemized statement of all court debt from the clerk of court.',
        'Distinguish: fines (punishment), fees (court costs), restitution (victim-owed), interest.',
        'Virginia: court costs and fines generally have a 20-year collection window.'])])
    st+=sec(s,'Step 2 — Apply for a Hardship Waiver',[lvt(s,[
        ('Virginia Form','File DC-41 (Petition for Reduction of Fines/Costs) with the original court.'),
        ('Eligibility','Household income at or below 125% of federal poverty level.'),
        ('What to Bring','Photo ID, proof of income, proof of dependents, list of all debts and monthly expenses.'),
        ('Outcome','Court may reduce, waive, or convert to community service hours.')])])
    st+=sec(s,'Step 3 — Challenge a License Suspension',[bul(s,[
        'Virginia eliminated most license suspensions for unpaid court costs in 2020 (SB 1776).',
        'File a Petition for Restricted License if suspension is still active.',
        'Contact DMV directly to understand the specific suspension reason before any action.',
        'DC: appeal with DC Office of Administrative Hearings within 30 days of suspension.'])])
    st+=sec(s,'Step 4 — Stop a Wage Garnishment',[bul(s,[
        'Federal law limits garnishment to 25% of disposable income or 30x minimum wage — whichever is less.',
        'File a Claim of Exemption (Virginia: form DC-459) within 10 days of receiving notice.',
        'Exempt income: Social Security, SSI, child support, VA benefits, unemployment.',
        'If income is below the poverty line, all may be exempt — document and file immediately.'])])
    st+=sec(s,'Payment Plan Script',[lvt(s,[
        ('Opening','"I want to resolve this debt but cannot pay in full. I request a payment plan based on my current income."'),
        ('Income Statement','"My monthly income is $[X] and necessary expenses are $[Y], leaving $[Z] available for repayment."'),
        ('The Ask','"I request a plan of $[AMOUNT] per month for [DURATION]."'),
        ('If Denied','"Please document the denial in writing and provide a supervisor contact.\"')])])
    st+=sec(s,'Virginia Hardship Waiver Eligibility',[cbt(s,[
        'Virginia resident','Court debt owed to Virginia court',
        'Income at/below 125% federal poverty line','Proof of income available',
        'Compliance with any existing payment plan','Debt more than 2 years old'])])
    st.append(tb(s,'IRN can connect you with free legal assistance for fines/fees challenges. Contact IRNVP@pm.me. Many people successfully reduce or eliminate court debt.'))
    d.build(st, onFirstPage=hf, onLaterPages=hf); print('✓ fines-fees-relief-roadmap.pdf')

# ─── 12. ACTIVIST OPSEC ─────────────────────────────────────────
def pdf_opsec():
    s=base_styles(); d=mkdoc('activist-opsec-checklist.pdf','Activist OpSec Checklist'); st=[]
    st+=cover(s,'Activist OpSec Checklist','74-point operational security checklist for organizers, advocates, and protesters.',FOREST)
    st.append(nb(s,'Operational security is professionalism, not paranoia. Protecting your data protects your community. Review quarterly.'))
    st.append(Spacer(1,6))
    st+=sec(s,'Device Security',[cbt(s,[
        'Full-disk encryption enabled on all devices','Strong passcode (6+ digits, not biometric alone)',
        'Auto-lock set to 1–2 minutes','OS and apps fully updated',
        'Antivirus installed (Android)','Unused apps removed',
        'Location services minimized','App permissions reviewed quarterly',
        'Backups encrypted','Cloud sync disabled for sensitive files'])])
    st+=sec(s,'Communication Security',[cbt(s,[
        'Signal installed for internal comms','Signal disappearing messages enabled (7 days)',
        'ProtonMail or Tutanota for sensitive email','Avoid SMS/standard calls for sensitive topics',
        'Signal group has 2+ trusted admins','New members vetted before adding to secure groups',
        'Separate email for organizing vs personal','Password manager in use (Bitwarden recommended)',
        'Unique passwords on all accounts','2FA enabled everywhere (authenticator app, not SMS)'])])
    st+=sec(s,'Protest Safety',[cbt(s,[
        'KYR reviewed before attending','Emergency contact written on arm in marker',
        'Legal observer contact saved (not just in phone)','Bail fund contact saved',
        'Buddy system established','Check-in protocol agreed',
        'Avoid identifiable clothing/tattoos','Face covering available if desired',
        'Disable Face ID/Touch ID before attending','Airplane mode + VPN before filming police',
        'Back up footage immediately after','Know first aid basics'])])
    st+=sec(s,'Social Media & Digital Footprint',[cbt(s,[
        'Review public posts quarterly','Audit tagged photos and location data',
        'Private accounts for sensitive organizing','Avoid real-time location posts during actions',
        'Do not post others faces without consent','Review past event RSVPs (they are public)',
        'Use VPN on public WiFi always','Tor Browser for sensitive research',
        'Check HaveIBeenPwned.com for breaches','Separate browser profiles for organizing vs personal'])])
    st+=sec(s,'Document & Organizational Security',[cbt(s,[
        'Sensitive files encrypted (VeraCrypt/Cryptomator)','Member lists not stored unencrypted in cloud',
        'Minimal data retention policy followed','Old sensitive files securely deleted',
        'Shared doc access reviewed monthly','Removed members lose access immediately',
        'Leadership team uses Signal for internal comms','New member vetting process documented',
        'Suspicious contact reporting protocol exists','Data breach response plan exists'])])
    st.append(tb(s,'Build a quarterly security review into your organizational calendar. The threat level changes — your practices should too.'))
    d.build(st, onFirstPage=hf, onLaterPages=hf); print('✓ activist-opsec-checklist.pdf')

# ─── 13. SECURE COMMS GUIDE ─────────────────────────────────────
def pdf_secure_comms():
    s=base_styles(); d=mkdoc('secure-comms-setup-guide.pdf','Secure Comms Setup Guide'); st=[]
    st+=cover(s,'Secure Comms Setup Guide','Step-by-step setup for Signal, ProtonMail, and VPN for organizer teams.',FOREST)
    st+=sec(s,'Signal — Secure Messaging',[bul(s,[
        'Download from signal.org/download (not from search ads — use the direct link).',
        'Register with a phone number. For high-risk work, use Google Voice or MySudo.',
        'Registration Lock PIN: Settings → Account → Registration Lock.',
        'Disappearing messages: open conversation → timer icon → 1 week.',
        'Group: set 2+ admins, enable admin-only join link, regularly audit membership.'])])
    st+=sec(s,'ProtonMail — Encrypted Email',[bul(s,[
        'Sign up at proton.me with a username that does not reveal your identity.',
        'Enable 2FA immediately: Settings → Security → Two-Factor Authentication.',
        'ProtonMail to ProtonMail = end-to-end encrypted automatically.',
        'For non-Proton recipients: use Password-Protected Emails for sensitive messages.',
        'Never access on public WiFi without a VPN.'])])
    st+=sec(s,'VPN Setup',[lvt(s,[
        ('Recommended','Mullvad (anonymous payment) or ProtonVPN (audited, open source).'),
        ('Avoid','Free VPNs — they profit by selling your data. Defeats the purpose.'),
        ('When to Use','Always on public WiFi. When researching sensitive topics. When filing FOIA requests.'),
        ('Kill Switch','Enable — cuts internet if VPN drops, preventing data leaks.'),
        ('Verify','After connecting: go to dnsleaktest.com and confirm your real IP is hidden.')])])
    st+=sec(s,'Burner Phone Protocol (High-Risk Actions Only)',[bul(s,[
        'Buy prepaid phone with cash. Activate on public WiFi — NOT your home network.',
        'Never log into personal accounts on the burner.',
        'Install only Signal and Firefox + uBlock Origin.',
        'Keep powered off and in airplane mode when not in use.',
        'Destroy the SIM card when done — not just the phone.'])])
    st+=sec(s,'Encrypted File Sharing',[lvt(s,[
        ('Small files','Signal file sharing (end-to-end encrypted).'),
        ('Larger files','OnionShare — open source, peer-to-peer, no accounts. onionshare.org'),
        ('Collaborative docs','CryptPad — encrypted Google Docs alternative. cryptpad.fr'),
        ('Cloud storage','Proton Drive or Tresorit. Avoid Google Drive for sensitive materials.')])])
    st.append(tb(s,'Best security tool = the one your team actually uses. Start with Signal and ProtonMail. Get those consistent before adding complexity.'))
    d.build(st, onFirstPage=hf, onLaterPages=hf); print('✓ secure-comms-setup-guide.pdf')

# ─── 14. DIGITAL ORGANIZING PLAYBOOK ───────────────────────────
def pdf_digital_playbook():
    s=base_styles(); d=mkdoc('digital-organizing-playbook.pdf','Digital Organizing Playbook'); st=[]
    st+=cover(s,'Digital Organizing Playbook','Run campaigns online without handing your data to surveillance capitalism.',FOREST)
    st+=sec(s,'Principle 1 — Own Your List',[bul(s,[
        'Social media followers are not your base. The platform can remove your account at any time.',
        'Build an email list from day one — the only digital asset you truly own.',
        'Every campaign action should include an email capture.',
        'Target: 1,000 emails = meaningful local list. 10,000 = significant campaign infrastructure.'])])
    st+=sec(s,'Principle 2 — Peer-to-Peer Texting',[bul(s,[
        'P2P texting gets 90%+ open rates vs 20% for email.',
        'Tools: ThruText, Spoke (open source), or Hustle.',
        'Use for: event reminders, rapid response, direct action mobilization.',
        'Consent required: only text people who have explicitly opted in.'])])
    st+=sec(s,'Principle 3 — Ethical Social Media Strategy',[lvt(s,[
        ('Content Pillar 1','STORIES — human narratives of people affected by the injustice you fight.'),
        ('Content Pillar 2','EVIDENCE — documents, data, records that prove your claims.'),
        ('Content Pillar 3','ACTION — specific things followers can do right now.'),
        ('Content Pillar 4','WIN STORIES — celebrate victories publicly and specifically.'),
        ('Cadence','3–5 posts/week on primary platform. Quality over quantity.'),
        ('Avoid','Content that exploits trauma. Posting faces without consent. Vague calls to action.')])])
    st+=sec(s,'Principle 4 — Community-Owned Platforms',[bul(s,[
        'Internal comms: Signal groups (NOT Facebook or WhatsApp).',
        'Docs: CryptPad or Nextcloud (self-hosted).',
        'Website: Ghost (self-hosted) or WordPress — platforms you control.',
        'Events: Mobilize.us or direct email/Signal — avoid Facebook Events for strategy.'])])
    st+=sec(s,'Digital Campaign Launch Checklist',[cbt(s,[
        'Email list started','Primary social media account secured',
        'Signal group for core team created','Action landing page built',
        'Email auto-responder set up','P2P texting platform selected',
        'Analytics tracking installed','Content calendar drafted (4 weeks)',
        'Crisis comms protocol established','2FA enabled on all accounts',
        'Data retention policy documented','Privacy policy on website'])])
    st.append(tb(s,'Biggest mistake: confusing likes with power. Power is built through relationships and commitment — digital tools amplify that, they do not replace it.'))
    d.build(st, onFirstPage=hf, onLaterPages=hf); print('✓ digital-organizing-playbook.pdf')

# ─── 15. PUBLIC NARRATIVE FRAMEWORK ────────────────────────────
def pdf_narrative():
    s=base_styles(); d=mkdoc('public-narrative-framework.pdf','Public Narrative Framework'); st=[]
    st+=cover(s,'Public Narrative Framework','Marshall Ganz Story of Self / Us / Now — adapted for IRN campaigns.',EMBER)
    st.append(Paragraph('Public narrative translates values into action through story. It answers: Why me? Why us? Why now? Done well, it moves people from passive sympathy to active commitment.',s['IRNBody']))
    st.append(Spacer(1,6))
    st+=sec(s,'Story of Self — Why YOU?',['Why have you been called to this work? What experience shaped your values?',
        lvt(s,[('The Challenge','What happened that forced a choice? One specific moment.'),
               ('The Choice','What did you do? What values drove that choice?'),
               ('The Outcome','What changed? What did you learn?')]),
        Spacer(1,5), Paragraph('Draft your Story of Self (90 seconds max):',s['IRNLabel']),
        wl(s),wl(s),wl(s),wl(s),
        Spacer(1,5), tb(s,'Specificity = credibility. "I was scared" is weak. "I was shaking in the parking lot of the courthouse at 7am" is strong.')])
    st+=sec(s,'Story of Us — Why WE?',['Why are we called together? What shared experience or values unite this community?',
        lvt(s,[('Shared Experience','What do we all face? What do we have in common?'),
               ('Shared Values','What do we believe together that calls us to act?'),
               ('The Us','Who is in this "us"? Specific enough to be meaningful.')]),
        Spacer(1,5), Paragraph('Draft your Story of Us (60 seconds max):',s['IRNLabel']),
        wl(s),wl(s),wl(s)])
    st+=sec(s,'Story of Now — Why NOW?',['What is the urgent challenge? What happens if we don\'t act?',
        lvt(s,[('The Challenge','What specific threat or opportunity is at hand RIGHT NOW?'),
               ('The Hope','What specific action can shift this? What does winning look like?'),
               ('The Ask','What EXACTLY do you want people to do in the next 24–72 hours?')]),
        Spacer(1,5), Paragraph('Draft your Story of Now (60 seconds max):',s['IRNLabel']),
        wl(s),wl(s),wl(s)])
    st+=sec(s,'Example Narrative — Tenant Organizing',['SELF: "My landlord ignored my heat complaint for two months. My daughter got sick. I almost didn\'t say anything — I was scared of retaliation. But I did."\n\nUS: "Half of us in this building have the same story."\n\nNOW: "Tomorrow morning we have a meeting with the housing authority. We need 20 people. Will you be one of them?"'])
    st.append(nb(s,'Narrative is not manipulation — it is translation. Story creates the emotional context in which people make rational choices to act.'))
    d.build(st, onFirstPage=hf, onLaterPages=hf); print('✓ public-narrative-framework.pdf')

# ─── 16. MEDIA PITCH & PRESS RELEASE ───────────────────────────
def pdf_media():
    s=base_styles(); d=mkdoc('media-pitch-press-release-template.pdf','Media Pitch & Press Release Template'); st=[]
    st+=cover(s,'Media Pitch & Press Release Template','Journalist-tested templates for getting your campaign covered.',EMBER)
    st+=sec(s,'Cold Pitch Email Template',[
        'SUBJECT: [SPECIFIC ANGLE IN 7 WORDS] — [LOCATION]\n\nHi [JOURNALIST FIRST NAME],\n\n[HOOK: One sentence — why this story matters RIGHT NOW to their readers.]\n\n[PROOF: A statistic, document, or verifiable fact that makes the hook credible.]\n\n[STORY: One specific person or incident that humanizes the issue.]\n\n[EXCLUSIVITY: Why you are bringing this to them specifically.]\n\nI can make available:\n  * On-the-record spokesperson: [NAME, TITLE]\n  * Documents: [DESCRIBE — FOIA records, internal emails, etc.]\n  * Community members willing to speak on record\n  * Expert sources: [NAME, CREDENTIAL]\n\nAvailable for a 10-minute call. When works for you?\n\n[YOUR NAME / TITLE / ORGANIZATION / PHONE]'])
    st+=sec(s,'Press Release Template',[
        'FOR IMMEDIATE RELEASE\n\n[CONTACT NAME]  [PHONE]  [EMAIL]\n\n────────────────────────────────────────────────\n\n[HEADLINE — Active verb, specific, 8 words max]\n[SUBHEADLINE — One sentence expanding the headline]\n\n[CITY, DATE] — [LEAD PARAGRAPH: Who did What, Where, When, Why it matters. Max 75 words. If a reporter reads only this, they have the story.]\n\n[SUPPORTING PARAGRAPH: Evidence, context, specifics. Quote placed here.]\n"[Direct quote that makes an arguable claim]," said FirstName LastName, Title, Organization.\n\n[IMPACT PARAGRAPH: Who is affected? How many? What does this mean?]\n\n[BACKGROUND: 2–3 sentences of context.]\n\n"[Second quote — from a community member, not a spokesperson]," said [NAME, TITLE].\n\n###\n\nABOUT [ORGANIZATION]: [2 sentences — what you do, who you serve.]\n\nADDITIONAL RESOURCES: [Document download URL] | [Photo/video available: YES/NO]'])
    st+=sec(s,'Media Contact Tracker',[flt(s,['Journalist','Outlet','Beat','Contact','Date Pitched','Response','Published?'],[['','','','','','','']*1]*6)])
    st+=sec(s,'Hook Formulas That Work',[flt(s,['Formula','Example'],[
        ['The Number','"183 families received eviction notices in a single month in Norfolk"'],
        ['The Document','"Internal emails obtained by IRN show the department knew about the contamination for 2 years"'],
        ['The Pattern','"At least 6 people reported the same officer — none resulted in discipline"'],
        ['The Contradiction','"The mayor said the program serves everyone. FOIA records show 94% of recipients are white"'],
        ['The Deadline','"The city council votes Thursday. Residents say they don\'t know what is in the proposal"'],])])
    st.append(tb(s,'Local news first. City council reporters, housing beat, and criminal justice reporters at local papers are your primary targets. National coverage follows local coverage.'))
    d.build(st, onFirstPage=hf, onLaterPages=hf); print('✓ media-pitch-press-release-template.pdf')

# ─── 17. ENVIRONMENTAL JUSTICE ──────────────────────────────────
def pdf_env():
    s=base_styles(); d=mkdoc('environmental-justice-campaign-starter-kit.pdf','Environmental Justice Campaign Starter Kit'); st=[]
    st+=cover(s,'Environmental Justice Campaign Starter Kit','Fight a toxic facility, pollution source, or discriminatory land-use decision in your community.',FOREST)
    st+=sec(s,'Step 1 — Document the Harm',[bul(s,[
        'Gather community health data: asthma, cancer, chronic illness rates, complaints to health dept.',
        'Use EPA EJScreen (ejscreen.epa.gov) to show your community\'s cumulative environmental burden score.',
        'Map pollution sources using EPA\'s Facility Registry System (FRS) and Toxic Release Inventory (TRI).',
        'Take air quality readings with Purple Air monitors or rent from local environmental groups.',
        'Collect community testimony: who got sick, when, what they reported, to whom.'])])
    st+=sec(s,'Step 2 — File Regulatory Complaints',[lvt(s,[
        ('EPA Civil Rights','File under Title VI — agencies with federal funds cannot discriminate in pollution siting. epa.gov/ocr/filing-complaint'),
        ('EPA TIP Hotline','Report violations: 1-800-424-4372'),
        ('Virginia DEQ','deq.virginia.gov or (800) 592-5482'),
        ('Maryland MDE','mde.maryland.gov/complaints'),
        ('NC DEQ','deq.nc.gov/about/divisions/compliance')])])
    st+=sec(s,'Step 3 — Legal Intervention Points',[flt(s,['Stage','Intervention','How'],[
        ['Permit Application','Public Comment Period','Submit written comments. Organize hearings attendance.'],
        ['Permit Issued','Administrative Appeal','Challenge within 30 days. Attorney required for formal challenges.'],
        ['Operations','Citizen Suit','Clean Air Act § 304 and Clean Water Act § 505 allow citizen suits for violations.'],
        ['Federal Agency Involved','NEPA Comment','Submit comments on Environmental Impact Statement.'],
        ['Zoning Decision','City/County Appeal','Challenge discriminatory zoning within appeal windows.']])])
    st+=sec(s,'Step 4 — Data Sources',[flt(s,['Resource','What It Shows','URL'],[
        ['EPA EJScreen','EJ scores by location','ejscreen.epa.gov'],
        ['EPA TRI','Toxic releases by facility','epa.gov/toxics-release-inventory-tri-program'],
        ['EPA AQS','Air quality monitoring data','epa.gov/outdoor-air-quality-data'],
        ['CDC PLACES','Community health data by zip','cdc.gov/places'],
        ['ProPublica Cancer Map','Cancer risk from air pollution','propublica.org/article/toxmap'],])])
    st+=sec(s,'Step 5 — Coalition Building',[bul(s,[
        'Identify health organizations, faith communities, schools, and community centers affected.',
        'Connect with: Earthjustice, WE ACT, NAACP Environmental & Climate Justice Program.',
        'Medical providers who can speak publicly about patient impacts are powerful coalition members.',
        'Investigative journalists: environmental + racial justice angle = high-interest story.'])])
    st.append(tb(s,'Strongest EJ argument = health data (what community suffers) + facility data (who is polluting) + demographic data (who lives near facility) in a single document.'))
    d.build(st, onFirstPage=hf, onLaterPages=hf); print('✓ environmental-justice-campaign-starter-kit.pdf')

# ─── 18. LEGISLATIVE BRIEF ──────────────────────────────────────
def pdf_legislative():
    s=base_styles(); d=mkdoc('community-legislative-brief-template.pdf','Community Legislative Brief Template'); st=[]
    st+=cover(s,'Community Legislative Brief Template','Turn community narratives into legislative briefs that lawmakers actually read.',BLUE)
    st.append(Paragraph('A legislative brief is a 1–3 page document presenting a specific policy ask to a legislator or committee. It must be concise, evidence-based, and action-oriented.',s['IRNBodyMuted']))
    st.append(Spacer(1,6))
    st+=sec(s,'1. Issue Summary (50 words max)',['State the problem in plain language a non-expert understands in 30 seconds.',wl(s),wl(s),wl(s)])
    st+=sec(s,'2. Affected Population Data',[lvt(s,[
        ('Who Is Affected','(demographic, geographic, economic description)'),
        ('How Many People','(cite source)'),
        ('Geographic Scope','(city, county, state, legislative district)'),
        ('Equity Impact','(how does this disproportionately affect specific communities?)')]),
        nb(s,'"347 families in your district are affected" beats any national statistic when talking to a local legislator.')])
    st+=sec(s,'3. The Policy Ask',[lvt(s,[
        ('Primary Ask','(specific bill, amendment, vote, or action you want)'),
        ('Bill Number','(if exists)'),
        ('Alternative Ask','(if primary ask fails)'),
        ('Why This Legislator','(committee, district, past positions)'),
        ('Deadline / Vote Date','')])])
    st+=sec(s,'4. Three Strongest Evidence Points',[lvt(s,[
        ('Evidence #1','(statistic + source)'),
        ('Evidence #2','(document, research finding + source)'),
        ('Evidence #3','(comparable jurisdiction or expert citation + source)')])])
    st+=sec(s,'5. Community Testimony (75 words max)',['First-person account from a directly affected community member.',wl(s),wl(s),wl(s),wl(s)])
    st+=sec(s,'6. Endorsing Organizations',[flt(s,['Organization','Contact','Type','Authorization'],[['','','',''],['','','',''],['','','','']])])
    st+=sec(s,'7. Anticipated Opposition & Responses',[flt(s,['Expected Counterargument','Our Response'],[['',''],['',''],['','']])])
    st+=sec(s,'8. Contact & Follow-Up',[lvt(s,[
        ('Primary Contact','(name, phone, email)'),('Organization',''),
        ('Meeting Request Sent','Yes / No — Date: ___________'),
        ('Follow-up Date',''),('Legislator Response','')])])
    st.append(tb(s,'Brief is a door-opener. Request a 15-minute meeting. Bring 3 people: a spokesperson, a community member with a personal story, and a policy expert.'))
    d.build(st, onFirstPage=hf, onLaterPages=hf); print('✓ community-legislative-brief-template.pdf')

# ─── RUN ALL ─────────────────────────────────────────────────────
if __name__ == '__main__':
    print('Building all 18 IRN resource PDFs...\n')
    pdf_power_mapping()
    pdf_base_building()
    pdf_campaign_strategy()
    pdf_escalation()
    pdf_foia()
    pdf_kyr()
    pdf_incident()
    pdf_tenant()
    pdf_wrongful()
    pdf_police_records()
    pdf_fines()
    pdf_opsec()
    pdf_secure_comms()
    pdf_digital_playbook()
    pdf_narrative()
    pdf_media()
    pdf_env()
    pdf_legislative()
    print('\nAll 18 PDFs built. We locked in, no cap.')
