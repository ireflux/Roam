import { describe, expect, it } from "vitest";
import { decodePolyline6 } from "@/lib/routing/polyline";

const REAL_SHAPE =
  "osvqz@{revfF~QInQiCxNoBvFsAhFgCUyCdAaHUcCpJaD`IkCbGaCr@WtAk@zHcE~GyFIQdAg@`@o@hAaBLSlAkEXiB\iCJaAP{CrDiDjBiBOYcEeIxOqOjQcQnIwJ|BoCf@j@pJfK|@eAxKwM~BYrB?xA?tGuIx@aEb@_JdVeXJKv@gAnJiMl@v@f`@gh@gAsAgFjH}@gAhGmIlFEb_AsmATSLEb@ERGNK`a@ah@vCgEb@o@\}@N_ALkACoASuAOkAe@sAuNaQzAkAxOgSjGcIxk@qt@xDoFx@y@xCbJNhBt@lJ`@`BrAxBrBnC`EjFrBjCjWt`@jO~TbItQdB~M]zR_D~OwGrP{HtMulAdqBwzA`aCeNh`@eHf\qF|XwBrUi@xRWpPAt@PpTdAjQbBxHe@zDrFvHjDzEeGlHiDw@qPnLsq@vc@op@v[kd@pQk_Bhb@e~@|Fg\bAwnAiCug@qFy]YgApIgSS_KvCwZbGaMdDqKrC{b@pJ{HgCiAnEEVs@Wky@}RkDqAmAqAiDUlAiYAmQ?}ABeHgAaPOwB]qByA_DcNaVcLmWeDyDmAiAu@w@w@wAuIoSyJgV_LsXaRmf@mDoJgBiFaCoEkEaJcCgNFiGhCiK`DdBzB~DnFz@~FoAdCqHqEsNzDoBif@gdB{Tgw@mi@kdBwNce@qWmz@}DkMqF}Ze^grB";

describe("decodePolyline6", () => {
  it("解码真实 Valhalla 响应（上海步行），起点接近请求点", () => {
    const coords = decodePolyline6(REAL_SHAPE);
    expect(coords.length).toBeGreaterThan(50);
    const first = coords[0];
    expect(Math.abs(first[0] - 121.49)).toBeLessThan(0.01); // lng
    expect(Math.abs(first[1] - 31.24)).toBeLessThan(0.01); // lat
  });

  it("空输入返回空数组", () => {
    expect(decodePolyline6("")).toEqual([]);
  });
});