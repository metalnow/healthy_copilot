import { describe, expect, it } from "vitest";
import { REDACTED, redactIdentity } from "./redact";

describe("redactIdentity", () => {
  it("移除表頭的身分欄位，保留性別與檢查日期", () => {
    const text = [
      "客戶名稱： 夢想創造股份有限公司        工號    20210701 檢查日期：2022/06/29",
      "健康編號 00007 姓名 王小明            分公司／廠別 夢想創造股份有限公司           生日 1981/03/11",
      "部門   開發組                     單位           身分證字號 T1******44        性別 男",
      "  工號           姓名 王小明           分公司／廠別 夢想創造股份有限公司",
      "  健康編號 00019   部門 研發部                          職稱                   性別 男",
    ].join("\n");
    const { text: out, removed } = redactIdentity(text);
    for (const s of ["夢想創造", "20210701", "00007", "00019", "王小明", "1981/03/11", "T1******44", "開發組", "研發部"]) {
      expect(out).not.toContain(s);
    }
    expect(out).toContain("檢查日期：2022/06/29");
    expect(out).toContain("性別 男");
    expect(removed).toEqual(expect.arrayContaining(["姓名", "生日", "身分證字號", "工號", "客戶名稱"]));
  });

  it("移除病歷號、檢體編號、醫師姓名", () => {
    const text = "姓名 : 王◎明        病歷號 : 0002739043\n醫師姓名 : 陳大文   檢體編號 : 6106173793\n 醫     師：林醫師";
    const { text: out } = redactIdentity(text);
    for (const s of ["王◎明", "0002739043", "陳大文", "6106173793", "林醫師"]) expect(out).not.toContain(s);
  });

  it("空白欄位不會刪到下一行", () => {
    const text = "檢查機構：康寧醫院    聯絡人：\n院  址：台北市\n 醫     師：\n健康建議";
    expect(redactIdentity(text).text).toBe(text);
  });

  it("不動檢驗數值與表格欄位名稱", () => {
    const text = "檢驗代碼   檢驗結果   檢驗結果單位\nF23 蟹   3.41   KUA/l\n  AC sugar飯前血糖         92 (70～100 mg/dL)";
    expect(redactIdentity(text).text).toBe(text);
  });

  it("依提示移除使用者姓名、身分證、電話與 email", () => {
    const { text: out, removed } = redactIdentity("受檢者 王小明 A123456789 0912-345-678 me@example.com", { names: ["王小明", null] });
    expect(out).toBe(`受檢者 ${REDACTED} ${REDACTED} ${REDACTED} ${REDACTED}`);
    expect(removed).toEqual(expect.arrayContaining(["姓名", "身分證字號", "電話", "電子郵件"]));
  });
});
