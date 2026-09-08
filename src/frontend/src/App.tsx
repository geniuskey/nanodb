import { NavLink, Outlet, Route, Routes } from "react-router-dom";

import logo from "../../../assets/logo/nanodb_logo_horizontal.svg";
import { HomePage } from "./pages/HomePage";
import { ImageListPage } from "./pages/ImageListPage";
import { ImageRegisterPage } from "./pages/ImageRegisterPage";
import { MeasurementPage } from "./pages/MeasurementPage";

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
  return <Routes><Route element={<Shell />}><Route index element={<HomePage />} /><Route path="images" element={<ImageListPage />} /><Route path="images/new" element={<ImageRegisterPage />} /><Route path="images/:imageId" element={<MeasurementPage />} /></Route></Routes>;
}
