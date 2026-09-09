import { NavLink, Outlet, Route, Routes, useLocation } from "react-router-dom";

import logo from "../../../assets/logo/nanodb_logo_horizontal.svg";
import { SummaryContext, useSummary, useSummaryFetch } from "./api/summary-context";
import { CatalogPage } from "./pages/CatalogPage";
import { HomePage } from "./pages/HomePage";
import { ImageListPage } from "./pages/ImageListPage";
import { ImageRegisterPage } from "./pages/ImageRegisterPage";
import { MeasurementPage } from "./pages/MeasurementPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { ErrorBoundary } from "./ui/ErrorBoundary";

const REAL_TABS = [
  { to: "/", label: "홈", end: true },
  // `/images` stays non-exact so an image detail keeps the catalog tab lit,
  // but `/images/new` is its own tab: without this both would read as the
  // current location at once.
  { to: "/images", label: "이미지DB", end: false, notOn: "/images/new" },
  { to: "/images/new", label: "이미지 등록", end: false },
  { to: "/catalog", label: "목록 관리", end: false },
];

function StatusPill() {
  const { summary } = useSummary();

  if (!summary) {
    return <span className="status-pill">집계 준비 중</span>;
  }
  const at = new Date(summary.calculated_at).toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  });
  return (
    <span className="status-pill" data-testid="header-status">
      이미지 <strong>{summary.image_count}</strong> · 측정 <strong>{summary.measurement_count}</strong> · 기준 {at}
    </span>
  );
}

function Shell() {
  const summary = useSummaryFetch();
  const { pathname } = useLocation();
  return (
    <SummaryContext.Provider value={summary}>
    <div className="app-shell">
      {/* The header sits before the body; give keyboard users one hop past
          it (UIX-005). */}
      <a className="skip-link" href="#main-content">본문으로 건너뛰기</a>
      <header className="app-header">
        <NavLink className="brand" to="/" aria-label="NANoDB 홈">
          <img src={logo} alt="NANoDB" />
        </NavLink>
        <nav className="tabbar" aria-label="주요 메뉴">
          {REAL_TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                isActive && pathname !== tab.notOn ? "tab active" : "tab"
              }
            >
              <span className="tab-label">{tab.label}</span>
            </NavLink>
          ))}
        </nav>
        <StatusPill />
      </header>
      <div id="main-content" tabIndex={-1}>
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </div>
      <footer>데이터는 쌓이고, 툴은 이어진다.</footer>
    </div>
    </SummaryContext.Provider>
  );
}

export function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<HomePage />} />
        <Route path="images" element={<ImageListPage />} />
        <Route path="images/new" element={<ImageRegisterPage />} />
        <Route path="catalog" element={<CatalogPage />} />
        <Route path="images/:imageId" element={<MeasurementPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
