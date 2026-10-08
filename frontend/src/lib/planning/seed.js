// Sample data for the Planning, Task card and Invoicing screens, copied from the
// design prototype. It stands in for the backend until those endpoints exist:
// see services/planningApi.js, which is the only file that reads it.

export const NOTES = [
  { id: 1, from: 'Vanshika Shah', role: 'Content lead', ago: '5 min ago', pri: 'P1', task: 'Invesco tagline options', proj: 'Invesco Concept Presentations', client: 'Invesco Mutual Fund', due: 'Fri 9 Oct · 6:00 PM', dueIn: 'in 1 day', dueTone: 'soon', est: 3, qty: '10 options', note: 'Need 10 tagline options for the concept deck. Keep each under 8 words; the client prefers a calm, expert tone.', load: 5.5 },
  { id: 2, from: 'Sakshi Agrawal', role: 'Content manager', ago: '22 min ago', pri: 'P1', task: 'Compliance copy check – 6 posts', proj: 'ICICI Prudential Contra Fund', client: 'ICICI Prudential AMC', due: 'Today · 5:00 PM', dueIn: 'in 3h', dueTone: 'urgent', est: 1, qty: '6 posts', note: 'Check disclaimers and fund names against the latest factsheet before these go to the client.', load: 5.5 },
  { id: 3, from: 'Kaushal Shah', role: 'Animation lead', ago: '1h ago', pri: 'P2', task: 'Teaser cut-down – 15s', proj: 'FT_Senior Citizen Campaign', client: 'Franklin Templeton', due: 'Mon 12 Oct · 1:00 PM', dueIn: 'in 4 days', dueTone: 'ok', est: 2.5, qty: '1 video', note: 'Cut a 15s teaser from the approved animatic. Use the end card from v3.', load: 5.5 },
];

export const INV = [
  { id: 'i1', name: 'ICICI Prudential Contra Fund – Anniversary', client: 'ICICI Prudential MF', code: 'ICI-0226', poc: 'Jui', done: '15 Sep', wait: 23, items: [
    ['Content', 'Anniversary film script', 'Script', 1, 180], ['Content', 'Social captions pack', 'Copy', 12, 90], ['Content', 'Gujarati translation', 'Translation', 1, 40], ['Content', 'Blog – 10 years of contra', 'Article', 1, 210],
    ['Design', 'Anniversary carousel', 'Carousel', 2, 260], ['Design', 'Static posts', 'Social post', 6, 300], ['Design', 'Email banner', 'Banner', 1, 45], ['Design', 'Leaflet A5', 'Leaflet', 1, 120],
    ['Animation', 'Anniversary film 60s', 'Explainer', 1, 720, 60] ] },
  { id: 'i2', name: 'test 0.4', client: '360 ONE Asset', code: '360-0925', poc: 'Arpit Malode', done: '25 Sep', wait: 13, items: [
    ['Content', 'Product note', 'Document', 1, 95], ['Content', 'FAQ sheet', 'Document', 1, 60], ['Design', 'Factsheet layout', 'Document', 1, 140] ] },
  { id: 'i3', name: 'Nuvama SIF360 Bharat Summit 2026', client: 'Nuvama Asset Management', code: 'NUV-0912', poc: 'Ajinkya Patil', done: '12 Sep', wait: 26, items: [
    ['Content', 'Summit speech draft', 'Script', 1, 240], ['Content', 'Event invite copy', 'Copy', 1, 35] ] },
  { id: 'i4', name: 'Invesco Diwali SIP Carousels', client: 'Invesco', code: 'INV-1001', poc: 'Rhea Kapoor', done: '1 Oct', wait: 7, items: [
    ['Content', 'Carousel copy', 'Copy', 4, 120], ['Design', 'Diwali carousels', 'Carousel', 4, 480], ['Design', 'Story adaptations', 'Story', 4, 160], ['Animation', 'Diwali reel 15s', 'Reel', 2, 360, 15] ] },
  { id: 'i5', name: 'ITI Small Cap Social Posts', client: 'ITI MF', code: 'ITI-0927', poc: 'Nikhil Rao', done: '27 Sep', wait: 11, items: [
    ['Content', 'Post captions', 'Copy', 8, 80], ['Design', 'Static posts', 'Social post', 8, 360] ] },
];

export const RATE_TYPES = [
  ['Content', 'Script', 'Per piece', 1500], ['Content', 'Copy', 'Per piece', 400], ['Content', 'Translation', 'Per piece', 600], ['Content', 'Article', 'Per piece', 2500],
  ['Content', 'Document', 'Per piece', 1800], ['Content', 'Newsletter', 'Per piece', 2000], ['Content', 'Video script', 'Per piece', 2000],
  ['Design', 'Social post', 'Per piece', 1200], ['Design', 'Carousel', 'Per piece', 3000], ['Design', 'Story', 'Per piece', 800], ['Design', 'Banner', 'Per piece', 1000],
  ['Design', 'Leaflet', 'Per piece', 3500], ['Design', 'Document', 'Per piece', 4000], ['Design', 'Presentation deck', 'Per slide', 700],
  ['Animation', 'Reel', 'Up to 15s', 6000, 0, 15], ['Animation', 'Reel', '16 – 30s', 9000, 16, 30], ['Animation', 'Reel', '31 – 60s', 14000, 31, 60],
  ['Animation', 'Explainer', 'Per minute', 18000, 0, 9999, true], ['Animation', 'Motion post', 'Per piece', 3500], ['Animation', 'GIF', 'Per piece', 2000],
].map(([cat, type, unit, rate, lo, hi, perMin]) => ({ id: cat + '|' + type + '|' + unit, cat, type, unit, rate, lo, hi, perMin: !!perMin }));

export const INV_MAKERS = { Content: ['Ratnesh Bor', 'Krupali Gharge', 'Sakshi Agrawal'], Design: ['Milind Tandi', 'Krishna Saraswat', 'Vanshika Shah'], Animation: ['Tejas Pawar'] };

export const P_PEOPLE = [
  ['Ratnesh Bor', 'Content', 91, 4.5, 1.4, []], ['Sakshi Agrawal', 'Content', 74, 4.2, 1.9, []], ['Krupali Garge', 'Content', 88, 4.6, 1.2, [4]], ['Milind Tandi', 'Content', 94, 4.6, 1.1, []], ['Vanshika Shah', 'Content', 86, 4.4, 1.5, []],
  ['Manali Sharma', 'Design', 79, 4.1, 2.0, []], ['Aniket Bangal', 'Design', 83, 3.8, 2.6, []], ['Shraddha Batawale', 'Design', 68, 4.0, 2.2, []],
  ['Kaushal Shah', 'Animation', 72, 4.3, 1.8, []], ['Tejas Pawar', 'Animation', 62, 4.0, 2.1, []],
];

export const P_TASKS = [
  ['Ratnesh Bor', 'The Uncomfortable Years – script', 'ICICI Prudential Contra Fund', 2, 3, 6, 'rolled', 'From Wed · 1d late', 9.5, 'wip'],
  ['Ratnesh Bor', 'FAQ sheet', 'ICICI Prudential Contra Fund', 3, 3, 3, 'new', 'Assigned this morning', 13, 'todo'],
  ['Ratnesh Bor', 'Newsletter – October', 'Finace Monthly', 4, 4, 4, 'planned', 'Assigned Mon 28 Sep', 9.5, 'todo'],
  ['Ratnesh Bor', 'Contra blog outline', 'ICICI Prudential Contra Fund', 0, 1, 7, 'planned', 'Assigned Fri 2 Oct', 9.5, 'done'],
  ['Sakshi Agrawal', 'Senior Citizen script', 'FT_Senior Citizen Campaign', 1, 3, 9, 'rolled', 'Compliance pending · 2d late', 9.5, 'wip'],
  ['Sakshi Agrawal', 'Compliance follow-up', 'FT_Senior Citizen Campaign', 3, 3, 1.5, 'reprio', 'Raised to P1 by Vanshika', 12.5, 'todo'],
  ['Sakshi Agrawal', 'Invesco tagline options', 'Invesco Concept Presentations', 4, 4, 3, 'new', 'Assigned Tue 6 Oct', 9.5, 'todo'],
  ['Krupali Garge', 'Minimalist static copy', 'ICICI Prudential Contra Fund', 2, 2, 3, 'planned', 'Assigned Thu 1 Oct', 9.5, 'done'],
  ['Krupali Garge', 'Newsletter copy', 'Finace Monthly', 3, 4, 6, 'resched', 'Moved from Tue 6 Oct', 10, 'wip'],
  ['Milind Tandi', 'Contra investing blog edits', 'ICICI Prudential Contra Fund', 3, 3, 2, 'new', 'Assigned this morning', 10, 'todo'],
  ['Milind Tandi', 'SEO meta – 6 blogs', 'Finace Website', 0, 0, 3, 'planned', 'Assigned Wed 30 Sep', 9.5, 'done'],
  ['Vanshika Shah', 'Pitch narrative v2', 'Invesco Concept Presentations', 2, 3, 6, 'reprio', 'P3 → P1 · pitch moved up', 9.5, 'wip'],
  ['Vanshika Shah', 'Script reviews', 'FT_Senior Citizen Campaign', 3, 3, 2, 'planned', 'Assigned Mon 5 Oct', 15, 'todo'],
  ['Vanshika Shah', 'Concept deck review', 'Invesco Concept Presentations', 4, 4, 2, 'planned', 'Assigned Mon 5 Oct', 9.5, 'todo'],
  ['Manali Sharma', 'ITI SIP Leaflet – final', 'ITI SIP Leaflet', 1, 3, 14, 'rolled', 'Due Sat · behind plan', 9.5, 'wip'],
  ['Manali Sharma', 'ITI SIP Leaflets – Regional', 'ITI SIP Leaflet', 3, 4, 10, 'new', 'Assigned this morning', 14.25, 'todo'],
  ['Manali Sharma', 'Carousel – Contrarian investing', 'ICICI Prudential Contra Fund', 4, 4, 5, 'resched', 'Moved from Wed 7 Oct', 9.5, 'todo'],
  ['Aniket Bangal', 'WhatsApp creative – revision 5', 'ICICI Prudential Contra Fund', 3, 3, 3, 'rolled', 'Client changes · round 5', 9.5, 'wip'],
  ['Aniket Bangal', 'Email banner', 'ICICI Prudential Contra Fund', 3, 3, 2, 'new', 'Assigned Wed 7 Oct', 13, 'todo'],
  ['Aniket Bangal', 'Infographic – SIP vs lumpsum', 'Finace Monthly', 0, 1, 8, 'planned', 'Assigned Fri 2 Oct', 9.5, 'done'],
  ['Aniket Bangal', 'Story set – 5 frames', 'Invesco Concept Presentations', 4, 4, 4, 'planned', 'Assigned Mon 5 Oct', 9.5, 'todo'],
  ['Shraddha Batawale', 'Contra explainer reel – frames', 'ICICI Prudential Contra Fund', 0, 3, 18, 'rolled', '5d behind', 9.5, 'wip'],
  ['Shraddha Batawale', 'Carousel – Contrarian investing', 'ICICI Prudential Contra Fund', 3, 4, 8, 'reprio', 'Raised to P1 · client launch Fri', 14, 'todo'],
  ['Kaushal Shah', 'The Indian Contra Stories – AMUL', 'ICICI Prudential Contra Fund', 1, 3, 16, 'rolled', '4d behind', 9.5, 'wip'],
  ['Kaushal Shah', 'Senior Citizen animatic review', 'FT_Senior Citizen Campaign', 3, 3, 2, 'new', 'Assigned Wed 7 Oct', 15.5, 'todo'],
  ['Kaushal Shah', 'Teaser cut-down', 'FT_Senior Citizen Campaign', 4, 4, 6, 'resched', 'Moved from Mon 12 Oct', 9.5, 'todo'],
  ['Tejas Pawar', 'Senior Citizen animatic', 'FT_Senior Citizen Campaign', 2, 4, 14, 'rolled', 'Waiting on Design files', 11, 'wip'],
  ['Tejas Pawar', 'Logo sting – 5s', 'Finace Brand', 0, 0, 3, 'planned', 'Assigned Thu 1 Oct', 9.5, 'done'],
];

export const P_DAYS = ['Mon 5', 'Tue 6', 'Wed 7', 'Thu 8', 'Fri 9'];
export const P_TODAY = 3;
export const P_HPD = 8.5;
export const P_NOW = 13.67;

export const P_CATS = {
  rolled: ['Rolled over / delayed', 'var(--error-50)', 'rgb(153,27,27)', 'inset 0 0 0 1px rgb(252,165,165)', 'var(--error-500)'],
  reprio: ['Reprioritised', 'var(--info-100)', 'rgb(30,64,175)', 'inset 0 0 0 1px rgb(147,197,253)', 'var(--info-500)'],
  resched: ['Rescheduled', 'var(--warning-100)', 'rgb(146,64,14)', 'inset 0 0 0 1px rgb(252,211,77)', 'var(--warning-500)'],
  new: ['New', 'var(--brand-50)', 'var(--brand-700)', 'inset 0 0 0 1px var(--brand-200)', 'var(--brand-500)'],
  planned: ['Planned earlier', 'var(--neutral-100)', 'var(--neutral-700)', 'inset 0 0 0 1px var(--neutral-200)', 'var(--neutral-400)'],
};

export const P_ORDER = ['new', 'planned', 'rolled', 'resched', 'reprio'];

export const NOTE_REASONS = ['Workload is full', 'Need more details', 'Deadline not possible', 'Not my skill area', 'Other'];
