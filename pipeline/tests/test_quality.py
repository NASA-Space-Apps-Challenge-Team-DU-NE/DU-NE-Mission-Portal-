import openpyxl
import pytest

from luna.quality import QualityError, QualityIndex, check_forbidden


def make_xlsx(path):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "파일 목록"
    ws.append(["파일명", "자료 구분", "품질 상태", "한 줄 설명", "관련 과학 임무", "폴더 경로"])
    ws.append(["ldem_75s_240m.img", "원본", "VALIDATED", "", "05", "DU_NE Data/Raw_Data/LOLA_DEM"])
    ws.append(["ldem_128.img", "원본", "VALIDATION_FAILED", "", "", "Raw_Data/LOLA_DEM_Global"])
    ws.append(["x.csv", "원본", "LIMITED_USE", "", "", "Raw_Data\\A"])
    wb.save(path)


def test_lookup_and_require(tmp_path):
    p = tmp_path / "l.xlsx"
    make_xlsx(p)
    qi = QualityIndex.from_xlsx(p)
    assert qi.require("Raw_Data/LOLA_DEM/ldem_75s_240m.img") == "VALIDATED"
    assert qi.require("Raw_Data/A/x.csv") == "LIMITED_USE"
    with pytest.raises(QualityError):
        qi.require("Raw_Data/A/x.csv", allow={"VALIDATED"})
    with pytest.raises(QualityError):
        qi.require("nope/none.bin")
    assert qi.require("nope/none.bin", allow_unlisted=True) == "REVIEW_REQUIRED"


def test_forbidden():
    with pytest.raises(QualityError):
        check_forbidden("Raw_Data/LOLA_DEM_Global/ldem_128.img")
    with pytest.raises(QualityError):
        check_forbidden("Raw_Data/Thermal/diviner_st_v1.tab")
    check_forbidden("Raw_Data/LOLA_DEM_Global/LOLA_LDEM128_75S_90S_native_rows.zip.part001.zip")
