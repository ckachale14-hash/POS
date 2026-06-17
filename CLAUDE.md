# PortionSpot Motors POS — Claude Context

## ENZO_CUTHBERT_KACHALE_AI_PROFILE_V1

### Who I Am

My name is **Enzo Cuthbert Kachale**. I am an entrepreneur from Zimbabwe and the owner of **PortionSpot Motors**, a wholesale motor spares and accessories business.

I have tried multiple businesses throughout my life — Fantasy Fabrics, cloth design, selling beer. Those experiences taught me valuable lessons about opportunity, risk, and sustainability. I chose the motor spares industry because I wanted a legitimate business with consistent demand and long-term growth potential.

---

### My Mission

To build one of the largest motor spares supply businesses in Zimbabwe while acquiring properties across the country. My goal is not only to make money but to build a lasting legacy for my family and help people in need.

---

### My Core Values

- Accountability
- Transparency
- Honesty
- Consistency
- Loyalty
- Family
- Faith
- Long-term thinking

Every dollar should be accounted for. People should communicate openly when there is a problem. I respect honesty more than perfection.

---

### My Business Philosophy

Business rewards consistency more than excitement. Most people fail because they chase quick money instead of building systems.

Success comes from: Knowledge · Discipline · Accountability · Patience · Vision

I always have a one-year plan and a five-year vision.

---

### My View on Customers

**Good customers:** Loyal, consistent, honest, communicate openly, respect relationships.

**Difficult customers:** Not necessarily the ones who complain — the worst are those who hide problems and refuse to communicate. Problems can only be solved when discussed honestly.

---

### My View on Business Risks

My biggest mistakes came from trusting the wrong people, buying liabilities instead of assets, and poor investment decisions. Trust must be earned through actions and consistency.

---

### My Investment Strategy

Focus on sourcing high-demand motor spares directly from manufacturers. Control supply, stock fast-moving products. Long-term objective: convert business profits into real estate and income-generating assets.

---

### My Personality

**Strengths:** Problem solving · Identifying business gaps · Practical decision making · Strategic thinking

**Weaknesses:** Perform best when focused; may struggle handling too many things at once. Slow to anger, but when pushed too far I become very direct and straightforward.

---

### What Frustrates Me

Unnecessary expenses · Lack of accountability · Counterfeit products · Dishonest people · Backbiting · People pretending to be successful when they are not

---

### What Motivates Me

My faith. I believe difficult seasons are temporary and often serve as tests that build character and wisdom. Biblical teachings about seasons, perseverance, and endurance guide many of my decisions.

---

### What I Value Most

1. Family
2. Faith
3. Business Growth
4. Legacy
5. Integrity

My wife and child are the most important people in my life.

---

### Communication Style

- **Tone:** Casual, friendly, natural — not corporate
- **Messages:** Short and direct by default; detailed when education or clarification is needed
- **Humour:** Positive, open humour that brings people together
- **Common expressions:** "Boss murisei" · "Murungu bhoo here" · "Start low, you'll be big soon"

---

### Negotiation Style

Willing to negotiate when it makes business sense. Focus on building long-term customer relationships rather than chasing short-term gains.

---

### Advice to New Motor Spares Entrepreneurs

Start with fast-moving essentials: oils, filters, spark plugs, brake pads, coolants, additives, bulbs, service parts. Build a strong customer base first. Expand gradually into specialized parts as demand grows. A starting capital of ~$1,000 can be enough if invested wisely.

---

### Success Formula

> **Success = Knowledge + Consistency + Accountability + Vision**

Track every cent. Know your numbers. Protect your profits. Plan one year ahead. Think five years ahead. Stay consistent even when progress feels slow.

---

## How Claude Should Assist Me

When helping with this project or any business question:

- Be **practical** rather than theoretical
- Think like an **entrepreneur**, not a consultant
- Prioritize **profitability and scalability**
- Suggest **long-term solutions**
- **Challenge weak business decisions** — don't just agree
- Communicate **clearly and directly**
- Keep responses **concise** unless deeper analysis is required
- Consider **Zimbabwean business realities** whenever possible

---

## About This Project

**PortionSpot Motors POS** is a React + Vite PWA point-of-sale system for the motor spares business. It uses Supabase for cloud sync and Dexie for offline-first local storage. It runs on web browsers and as an Android app.

### Tech Stack

- React 18 + React Router
- Vite + Tailwind CSS
- Supabase (backend/sync)
- Dexie (local IndexedDB)
- PWA (Workbox) + Android wrapper

### Key Pages

| Page | File | Purpose |
|------|------|---------|
| POS | `src/pages/POS.jsx` | Main sales interface |
| Inventory | `src/pages/Inventory.jsx` | Product management |
| Sales History | `src/pages/SalesHistory.jsx` | Analytics & reports |
| Customers | `src/pages/Customers.jsx` | Customer management |
| Purchase Orders | `src/pages/PurchaseOrders.jsx` | Supplier orders |
| Dashboard | `src/pages/Dashboard.jsx` | Business overview |
| Settings | `src/pages/Settings.jsx` | App configuration |

### Core Libraries

- `src/lib/db.js` — Local database + Supabase sync logic
- `src/lib/printer.js` — Thermal/Bluetooth printer driver (Sunmi/RawBT)
- `src/lib/sync.js` — Online/offline data synchronization
- `src/context/SessionContext.jsx` — Session and user state

### Development

```bash
npm run dev      # Start dev server
npm run build    # Production build
npm run preview  # Preview production build
```
