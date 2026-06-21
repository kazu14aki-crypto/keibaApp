export const FONT_DISPLAY = "'Shippori Mincho', serif";
export const FONT_BODY = "'Zen Kaku Gothic New', sans-serif";
export const FONT_MONO = "'JetBrains Mono', monospace";

export const colors = {
  bg: '#fafaf7',
  bgAlt: '#f1f0ea',
  card: '#ffffff',
  cardBorder: '#e3e0d6',
  ink: '#2a2620',
  inkDim: '#7a7468',
  gold: '#a87f2e',
  goldSoft: '#a87f2e1a',
  red: '#b3493f',
  green: '#3f7a52',
};

export const styles = {
  app: { minHeight: '100vh', background: colors.bg, color: colors.ink, fontFamily: FONT_BODY, paddingBottom: 60 },

  loadingWrap: { minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: colors.inkDim, fontFamily: FONT_BODY, background: colors.bg },
  loadingMark: { fontFamily: FONT_DISPLAY, fontSize: 36, color: colors.gold, marginBottom: 8 },
  loadingText: { fontSize: 13, letterSpacing: '0.05em' },

  header: { borderBottom: `1px solid ${colors.cardBorder}`, position: 'sticky', top: 0, background: 'rgba(250,250,247,0.92)', backdropFilter: 'blur(8px)', zIndex: 10 },
  headerInner: { maxWidth: 980, margin: '0 auto', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 },
  brand: { display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' },
  brandMark: { fontFamily: FONT_DISPLAY, fontSize: 26, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${colors.gold}`, borderRadius: '50%', color: colors.gold, flexShrink: 0 },
  brandTitle: { fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 18, letterSpacing: '0.03em' },
  brandSub: { fontSize: 11, color: colors.inkDim, letterSpacing: '0.08em', marginTop: 2 },
  nav: { display: 'flex', gap: 4, background: colors.bgAlt, padding: 4, borderRadius: 10, border: `1px solid ${colors.cardBorder}`, flexWrap: 'wrap' },
  navBtn: { background: 'none', border: 'none', color: colors.inkDim, padding: '8px 16px', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 500 },
  navBtnActive: { background: colors.gold, color: '#ffffff', fontWeight: 700 },
  logoutBtn: { background: 'none', border: `1px solid ${colors.cardBorder}`, color: colors.inkDim, padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12 },

  main: { maxWidth: 980, margin: '0 auto', padding: '32px 20px' },

  sectionHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16, marginBottom: 28 },
  h1: { fontFamily: FONT_DISPLAY, fontSize: 28, fontWeight: 800, margin: '4px 0', letterSpacing: '0.01em' },
  h2: { fontFamily: FONT_DISPLAY, fontSize: 20, fontWeight: 700, margin: '0 0 12px' },
  lead: { color: colors.inkDim, fontSize: 14, margin: 0 },

  primaryBtn: { background: colors.gold, color: '#ffffff', border: 'none', padding: '11px 22px', borderRadius: 8, fontWeight: 700, fontSize: 13.5, cursor: 'pointer', letterSpacing: '0.02em' },
  ghostBtn: { background: 'transparent', color: colors.gold, border: `1px solid ${colors.gold}55`, padding: '8px 16px', borderRadius: 8, fontWeight: 600, fontSize: 12.5, cursor: 'pointer' },
  backBtn: { background: 'none', border: 'none', color: colors.inkDim, fontSize: 13, cursor: 'pointer', marginBottom: 18, padding: '4px 0' },

  card: { background: colors.card, border: `1px solid ${colors.cardBorder}`, borderRadius: 14, padding: 24, marginBottom: 20, boxShadow: '0 1px 3px rgba(42,38,32,0.04)' },
  cardTitle: { fontFamily: FONT_DISPLAY, fontSize: 16, fontWeight: 700, margin: '0 0 4px' },
  dim: { color: colors.inkDim, fontSize: 12.5, marginTop: 4, marginBottom: 14 },
  errorText: { color: '#a13f35', fontSize: 12.5, marginTop: 8 },

  formGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16 },
  fieldLabel: { display: 'block', fontSize: 11.5, color: colors.inkDim, marginBottom: 6, letterSpacing: '0.03em' },
  input: { width: '100%', background: '#f3f1ea', border: `1px solid ${colors.cardBorder}`, color: colors.ink, padding: '10px 12px', borderRadius: 7, fontSize: 13.5, fontFamily: FONT_BODY, outline: 'none' },

  raceGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 },
  raceCard: { position: 'relative', background: colors.card, border: `1px solid ${colors.cardBorder}`, borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 3px rgba(42,38,32,0.04)' },
  raceCardTop: { padding: '20px 20px 16px', cursor: 'pointer' },
  raceCardHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8 },
  gradeTag: { background: colors.goldSoft, color: colors.gold, fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 5, letterSpacing: '0.05em', whiteSpace: 'nowrap' },
  todayTag: { background: '#3f7a521a', color: '#2c6b3f', fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 5, letterSpacing: '0.05em', whiteSpace: 'nowrap' },
  raceDate: { fontSize: 11, color: colors.inkDim, fontFamily: FONT_MONO },
  raceCardTitle: { fontFamily: FONT_DISPLAY, fontSize: 19, fontWeight: 700, margin: '0 0 8px' },
  raceCardMeta: { fontSize: 12.5, color: colors.inkDim },
  raceCardFoot: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, paddingTop: 14, borderTop: `1px solid ${colors.cardBorder}` },
  horseCount: { fontSize: 11.5, color: colors.inkDim },
  topPick: { fontSize: 11.5, color: colors.gold, fontWeight: 600 },
  deleteIconBtn: { position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', color: colors.inkDim, cursor: 'pointer', fontSize: 13, width: 26, height: 26, borderRadius: 6, opacity: 0.5 },

  raceHeadCard: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 24, flexWrap: 'wrap' },
  raceMemo: { fontSize: 13, color: colors.inkDim, marginTop: 10, lineHeight: 1.7, maxWidth: 560 },

  toolbar: { display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18, flexWrap: 'wrap' },
  toolbarHint: { fontSize: 11.5, color: colors.inkDim },

  tableWrap: { overflowX: 'auto' },
  tableHeadRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px 10px', borderBottom: `1px solid ${colors.cardBorder}`, minWidth: 760 },
  th: { fontSize: 11, color: colors.inkDim, textAlign: 'center', letterSpacing: '0.04em' },

  horseBlock: { borderBottom: `1px solid ${colors.cardBorder}` },
  horseRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '14px', cursor: 'pointer', minWidth: 760 },
  td: { textAlign: 'center', fontSize: 13.5 },
  wakuChip: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: '50%', fontSize: 12, fontWeight: 700 },
  scoreWrap: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 },
  scoreNum: { fontFamily: FONT_MONO, fontWeight: 700, fontSize: 14 },
  scoreBarTrack: { width: 56, height: 4, background: '#e8e5da', borderRadius: 2, overflow: 'hidden' },
  scoreBarFill: { height: '100%', background: colors.gold },

  horseDetail: { padding: '4px 14px 24px', minWidth: 760 },
  detailGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14, marginBottom: 20 },

  factorSection: { background: '#f3f1ea', border: `1px solid ${colors.cardBorder}`, borderRadius: 10, padding: 18, marginBottom: 16 },
  factorSectionTitle: { fontFamily: FONT_DISPLAY, fontSize: 13.5, fontWeight: 700, color: colors.gold, marginBottom: 14 },
  factorRow: { display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 },
  factorLabelWrap: { width: 150, flexShrink: 0 },
  factorLabel: { display: 'block', fontSize: 12.5, fontWeight: 600 },
  factorHint: { display: 'block', fontSize: 10.5, color: colors.inkDim, marginTop: 1 },
  factorValue: { width: 46, textAlign: 'right', fontFamily: FONT_MONO, fontSize: 13, fontWeight: 700, color: colors.gold, flexShrink: 0 },

  deleteTextBtn: { background: 'none', border: 'none', color: colors.red, fontSize: 12, cursor: 'pointer', padding: '6px 0' },
  addHorseBtn: { width: '100%', background: 'none', border: `1px dashed ${colors.cardBorder}`, color: colors.inkDim, padding: '14px', borderRadius: 10, cursor: 'pointer', fontSize: 13, marginTop: 12, minWidth: 760 },
  legendNote: { fontSize: 11, color: colors.inkDim, marginTop: 16, lineHeight: 1.7 },

  empty: { textAlign: 'center', padding: '60px 20px', border: `1px dashed ${colors.cardBorder}`, borderRadius: 14 },
  emptyMark: { fontFamily: FONT_DISPLAY, fontSize: 32, color: colors.gold, marginBottom: 14 },
  emptyText: { color: colors.inkDim, fontSize: 13.5, lineHeight: 1.8, marginBottom: 22 },

  statGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 14, marginBottom: 24 },
  statCard: { background: colors.card, border: `1px solid ${colors.cardBorder}`, borderRadius: 12, padding: '18px 20px' },
  statValue: { fontFamily: FONT_DISPLAY, fontSize: 28, fontWeight: 800, color: colors.gold },
  statLabel: { fontSize: 11.5, color: colors.inkDim, marginTop: 4 },

  barList: { display: 'flex', flexDirection: 'column', gap: 12 },
  barRow: { display: 'flex', alignItems: 'center', gap: 12 },
  barLabel: { width: 90, fontSize: 12.5, flexShrink: 0 },
  barTrack: { flex: 1, height: 8, background: '#f3f1ea', borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', background: colors.red, borderRadius: 4 },
  barValue: { width: 50, textAlign: 'right', fontSize: 11.5, fontFamily: FONT_MONO, color: colors.inkDim, flexShrink: 0 },

  toast: { position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: colors.gold, color: '#ffffff', padding: '12px 22px', borderRadius: 10, fontSize: 13, fontWeight: 700, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 50 },

  // --- ログイン画面専用 ---
  loginWrap: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: colors.bg, padding: 20 },
  loginCard: { width: '100%', maxWidth: 360, background: colors.card, border: `1px solid ${colors.cardBorder}`, borderRadius: 16, padding: '36px 32px', boxShadow: '0 4px 16px rgba(42,38,32,0.06)' },
  loginMark: { fontFamily: FONT_DISPLAY, fontSize: 30, width: 56, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${colors.gold}`, borderRadius: '50%', color: colors.gold, margin: '0 auto 20px' },
  loginTitle: { fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 20, textAlign: 'center', marginBottom: 4 },
  loginSub: { fontSize: 12, color: colors.inkDim, textAlign: 'center', marginBottom: 28, letterSpacing: '0.05em' },

  // --- 検索 ---
  searchBox: { display: 'flex', gap: 10, marginBottom: 24 },
  searchInput: { flex: 1, background: '#f3f1ea', border: `1px solid ${colors.cardBorder}`, color: colors.ink, padding: '12px 16px', borderRadius: 9, fontSize: 14, fontFamily: FONT_BODY, outline: 'none' },
  searchResultCard: { background: colors.card, border: `1px solid ${colors.cardBorder}`, borderRadius: 12, padding: '16px 18px', marginBottom: 10, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  searchResultName: { fontWeight: 700, fontSize: 14.5 },
  searchResultMeta: { fontSize: 12, color: colors.inkDim, marginTop: 3 },
  searchResultScore: { fontFamily: FONT_MONO, fontWeight: 700, color: colors.gold, fontSize: 15 },
};
