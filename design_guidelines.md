# Design Guidelines: AI-Powered MCA Lead Storefront

## Design Approach

**System**: Modern B2B SaaS approach inspired by Stripe's professionalism, Linear's clarity, and HubSpot's trust-building patterns. The design emphasizes data transparency, workflow efficiency, and enterprise credibility.

**Core Principle**: Balance professional authority (B2B trust) with modern clarity (accessible interfaces). Marketing pages project confidence and transparency; dashboards prioritize information density and workflow efficiency.

---

## Color Palette

### Light Mode
- **Primary Brand**: 217 91% 60% (Professional blue - trust, data, technology)
- **Primary Hover**: 217 91% 50%
- **Secondary Accent**: 142 76% 36% (Success green for quality scores, verification)
- **Background**: 0 0% 100% (Pure white)
- **Surface**: 220 13% 97% (Subtle gray for cards)
- **Border**: 220 13% 91%
- **Text Primary**: 222 47% 11%
- **Text Secondary**: 215 16% 47%

### Dark Mode
- **Primary Brand**: 217 91% 60%
- **Primary Hover**: 217 91% 70%
- **Secondary Accent**: 142 71% 45%
- **Background**: 222 47% 11%
- **Surface**: 217 33% 17%
- **Border**: 217 33% 23%
- **Text Primary**: 0 0% 98%
- **Text Secondary**: 217 20% 70%

### Semantic Colors
- **Success**: 142 76% 36% (Quality scores 80+, verified leads)
- **Warning**: 45 93% 47% (Scores 60-79, data flags)
- **Error**: 0 84% 60% (Failures, duplicates, invalid data)
- **Info**: 217 91% 60% (Neutral information, insights)

---

## Typography

**Font Stack**: 
- Primary: 'Inter' via Google Fonts (900, 700, 600, 500, 400)
- Monospace: 'JetBrains Mono' (for data, CSV previews, technical info)

**Hierarchy**:
- **H1 Marketing**: text-5xl font-black (Landing hero)
- **H1 Dashboard**: text-3xl font-bold (Page headers)
- **H2**: text-2xl font-bold
- **H3**: text-xl font-semibold
- **Body Large**: text-lg (Pricing descriptions, key value props)
- **Body**: text-base
- **Small**: text-sm (Helper text, metadata)
- **Tiny**: text-xs (Labels, timestamps, footnotes)

---

## Layout System

**Container Strategy**:
- Marketing pages: max-w-7xl for full sections, max-w-4xl for content blocks
- Dashboards: max-w-screen-2xl (accommodate data tables)
- Forms: max-w-2xl

**Spacing Primitives**: Use p-4, p-6, p-8, p-12, p-16 for consistent rhythm
- Component padding: p-4 to p-6
- Section spacing: py-12 to py-20
- Dashboard cards: p-6
- Tight elements (table cells, badges): p-2

**Grid Systems**:
- Pricing cards: grid-cols-1 md:grid-cols-2 lg:grid-cols-4
- Feature grids: grid-cols-1 md:grid-cols-2 lg:grid-cols-3
- Dashboard stats: grid-cols-1 md:grid-cols-2 lg:grid-cols-4
- Admin tables: Full-width responsive with horizontal scroll

---

## Component Library

### Marketing Components

**Hero Section**:
- Large heading (text-5xl font-black) with gradient text effect on key terms
- Subheading emphasizing "verified," "high-quality," "compliant"
- Dual CTA buttons (primary "View Pricing" + outline "See Sample Data")
- Trust badges row: "TCPA Compliant," "Verified Sources," "24hr Delivery," "Quality Guaranteed"
- Background: Subtle gradient (primary/10 to transparent) with abstract data visualization pattern

**Pricing Cards**:
- Four-column grid (Gold, Platinum, Diamond, Elite)
- Card structure: Tier name + badge (if recommended), price (large, bold), lead count, quality score badge (pill with score range), feature list with checkmarks, CTA button
- Elite tier: "Contact Sales" with distinctive styling (gradient border)
- Comparison emphasis: Highlight "Most Popular" with primary color accent

**Feature Grid**:
- Icon (lucide-react) + Title + Description cards
- Features: "AI Quality Scoring," "Deduplication Guarantee," "Consent Verified," "Industry Segmentation," "Instant Download," "Replace Guarantee"
- Icons in circular backgrounds with primary/10 bg

**Social Proof Section**:
- Stats bar: "X Leads Delivered," "Y% Average Quality Score," "Z Happy Customers," "24hr Avg Response"
- Each stat: Large number (text-4xl font-bold) + label below

### Dashboard Components

**Admin Upload Wizard**:
- Multi-step progress indicator (circles with connecting lines)
- Large dropzone with drag-drop visual (dashed border, upload cloud icon)
- Column mapping interface: Two-column table (CSV Header → Schema Field with dropdowns)
- Validation results panel: Expandable sections for errors/warnings/success counts
- AI Insights card: Collapsible summary with expandable segments

**Data Tables**:
- Sticky header with sort indicators
- Row hover states (bg-primary/5)
- Action column with icon buttons (View, Download, Delete)
- Pagination at bottom with page size selector
- Status badges: Pills with semantic colors (Processing, Ready, Published, Sold)

**Quality Score Display**:
- Large circular progress ring or horizontal bar with gradient fill
- Score ranges: 0-59 (red), 60-79 (yellow), 80-89 (green), 90-100 (emerald)
- Label below with quality tier name

**AI Insights Card**:
- Header: "AI-Generated Insights" with OpenAI attribution
- Sections: Executive Summary (paragraph), Segments (expandable list), Risk Flags (alert-style items), Outreach Angles (bulleted recommendations)
- Subtle background (surface color) with left accent border

**Order History Table**:
- Columns: Order ID, Date, Tier, Leads, Total, Status, Actions
- Download button: Icon + "Download CSV" with expiry timer if applicable
- Invoice link as secondary action

### Forms

**Input Fields**:
- Label above (text-sm font-medium)
- Input with border, rounded-lg, focus ring (primary color)
- Helper text below (text-xs text-secondary)
- Error state: red border + error message

**Buttons**:
- Primary: bg-primary text-white with hover state
- Outline: border-2 with transparent bg, hover fills
- Sizes: Small (px-3 py-1.5 text-sm), Default (px-4 py-2), Large (px-6 py-3 text-lg)

---

## Page Layouts

### Landing Page Structure
1. **Hero**: Full-width, centered content, dual CTAs, trust badges, subtle background pattern
2. **Value Proposition**: Three-column feature grid explaining process (Upload → Score → Deliver)
3. **Pricing Preview**: Condensed 4-tier comparison with "See Full Pricing" CTA
4. **Social Proof**: Stats bar + testimonial cards (if available)
5. **How It Works**: Step-by-step with icons and descriptions
6. **Compliance Section**: Prominent TCPA/CAN-SPAM compliance messaging with legal disclaimers
7. **FAQ**: Accordion-style Q&A addressing data quality, refunds, usage rights
8. **Final CTA**: Large centered section with signup/view pricing

### Pricing Page
- Detailed four-tier comparison table with expandable feature lists
- Feature comparison matrix below cards (checkmarks across tiers)
- Refund/replacement policy section
- FAQ specific to pricing and guarantees

### Customer Dashboard
- Sidebar navigation: Orders, Downloads, Account Settings
- Main content: Recent orders table, quick stats (total spent, leads purchased, active downloads)
- Order detail page: Full order summary, lead preview (first 5 rows with masked data), download section with expiry

### Admin Dashboard
- Top nav: Batches, Products, Orders, Customers, Insights
- Batch management: Table with upload date, status, lead count, quality average, actions
- Batch detail: Multi-tab view (Overview, Leads table, AI Insights, Publish to Tier)
- Product management: Tier configuration forms with pricing, filters, exclusivity toggles

---

## Images

**Hero Section**: Use abstract data visualization imagery - nodes/connections graph, flowing data streams, or dashboard screenshot mockup. Style should be modern, clean, tech-forward (blues/greens on dark bg). Size: 1920x1080 minimum, positioned right of hero text or as subtle background.

**Trust Section**: Small icon-style illustrations for compliance badges - shield icons, checkmark seals, certification emblems. Keep minimal and professional.

**Process Flow**: Custom iconography for workflow steps (upload icon, AI brain icon, download icon). Can use lucide-react icons styled consistently.

---

## Accessibility & Polish

- Maintain WCAG AA contrast ratios across all color combinations
- Focus indicators on all interactive elements (ring-2 ring-primary/50)
- Consistent dark mode implementation including all form inputs, tables, modals
- Loading states: Skeleton screens for tables, spinner for actions
- Toast notifications for success/error feedback (top-right, auto-dismiss)
- Empty states: Illustrative placeholders with CTAs ("No orders yet - Browse pricing")