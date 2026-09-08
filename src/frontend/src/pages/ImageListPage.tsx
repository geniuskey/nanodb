import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../api/client";
import type { ImageListView } from "../api/types";

type State = "loading" | "success" | "failure";

export function ImageListPage() {
  const [images, setImages] = useState<ImageListView[]>([]);
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    let active = true;
    api.listImages().then((value) => {
      if (active) { setImages(value); setState("success"); }
    }).catch(() => active && setState("failure"));
    return () => { active = false; };
  }, []);

  return (
    <main>
      <div className="page-heading">
        <div><p className="eyebrow">Image catalog</p><h1>이미지 목록</h1></div>
        <Link className="button primary" to="/images/new" data-testid="catalog-register-image">이미지 등록</Link>
      </div>
      {state === "loading" && <p role="status">이미지를 불러오는 중입니다.</p>}
      {state === "failure" && <p role="alert">이미지 목록을 불러오지 못했습니다.</p>}
      {state === "success" && images.length === 0 && (
        <section className="empty-state"><h2>등록된 이미지가 없습니다</h2><p>첫 SEM/TEM 이미지를 등록해 측정을 시작하세요.</p></section>
      )}
      {state === "success" && images.length > 0 && (
        <div className="image-grid" data-testid="image-catalog">
          {images.map((image) => (
            <Link className="image-card" to={`/images/${image.id}`} key={image.id} data-testid="catalog-image-card">
              <img src={image.file_url} alt={`${image.original_filename} 미리보기`} />
              <div><span className="badge">{image.image_type}</span><h2>{image.original_filename}</h2>
                <dl><div><dt>Product</dt><dd>{image.product_id}</dd></div><div><dt>Lot</dt><dd>{image.lot_id}</dd></div><div><dt>Wafer</dt><dd>{image.wafer_id}</dd></div></dl>
                <p>{image.measurement_count}개 측정</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
