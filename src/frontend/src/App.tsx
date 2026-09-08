import { NavLink, Outlet, Route, Routes } from "react-router-dom";

import logo from "../../../assets/logo/nanodb_logo_horizontal.svg";
import { HomePage } from "./pages/HomePage";
import { ImageListPage } from "./pages/ImageListPage";

function PendingPage({ title }: { title: string }) {
  return <main><p className="eyebrow">구현 준비 중</p><h1>{title}</h1><p>승인된 다음 Code Generation Step에서 구현됩니다.</p></main>;
}

function Shell() {
  return (
    <div className="app-shell">
      <header><NavLink to="/" aria-label="NANoDB 홈"><img src={logo} alt="NANoDB" /></NavLink>
        <nav aria-label="주요 메뉴"><NavLink to="/">홈</NavLink><NavLink to="/images">이미지 목록</NavLink><NavLink to="/images/new">이미지 등록</NavLink></nav>
      </header>
      <Outlet />
      <footer>데이터는 쌓이고, 툴은 이어진다.</footer>
    </div>
  );
}

export function App() {
  return <Routes><Route element={<Shell />}><Route index element={<HomePage />} /><Route path="images" element={<ImageListPage />} /><Route path="images/new" element={<PendingPage title="이미지 등록" />} /><Route path="images/:imageId" element={<PendingPage title="측정 화면" />} /></Route></Routes>;
}
