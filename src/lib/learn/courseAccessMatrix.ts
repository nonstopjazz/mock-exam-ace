/**
 * 課程開放矩陣的型別。
 *
 * 資料來自 learn_admin_course_access_matrix()，授權在資料庫層（is_admin），
 * 不是靠前端藏按鈕。
 *
 * 🛑 direct 與繼承來源（via_class / free）刻意【分開】。
 *    合成一個「看得到嗎」的布林，畫面就無法解釋「為什麼這個勾勾不掉」——
 *    老師會以為是 bug。
 */

export interface MatrixCourse {
  course_id: string;
  title: string;
  slug: string;
  /** DRAFT 的課也會回傳。學生還看不到，但「先設好開放對象再發布」是正常順序 */
  status: "DRAFT" | "PUBLISHED";
  /** FREE = 有課程功能的人都看得到，不必選課 */
  access: "FREE" | "ENROLLED";
}

export interface MatrixCell {
  /** 這位學生【個別】被開放這門課。這是勾選框控制的東西 */
  direct: boolean;
  /** 經由這個班級的開放而看得到（唯讀）。null = 沒有班級來源 */
  via_class: string | null;
  /** 這門課是免費課 —— 有功能的人都看得到，不必選課（唯讀） */
  free: boolean;
}

export interface MatrixStudent {
  student_id: string;
  name: string;
  /** 目前在籍的班級名稱，用來認人 */
  classes: string[];
  /** 第 1 道閘：有沒有「影片課程」這個功能。沒有的話什麼課都看不到 */
  has_feature: boolean;
  /** 功能是個別給的（true）還是班級帶來的（false） */
  feature_direct: boolean;
  /** key 是 course_id */
  courses: Record<string, MatrixCell>;
}

export interface MatrixClass {
  class_id: string;
  name: string;
  /** 目前在籍人數（已離開的不算） */
  member_count: number;
}

export interface CourseAccessMatrix {
  courses: MatrixCourse[];
  students: MatrixStudent[];
  /**
   * 班級篩選的選項。
   *
   * 🛑 由伺服器給，【不是】從 students[].classes 反推 ——
   *    那份資料已經被姓名搜尋與上限篩過，篩完剛好沒人的班級就會從選單裡
   *    消失，而那正是你想切過去看的班。
   */
  classes: MatrixClass[];
  student_total: number;
  student_limit: number;
  truncated: boolean;
  /** 伺服器【實際套用】的姓名條件（已 btrim）。畫面講的是這個，不是輸入框裡的字 */
  query: string | null;
}

/** learn_admin_course_grant_student() 的回傳 */
export interface GrantResult {
  granted: boolean;
  /** 開放課程時有沒有順便補上「影片課程」功能。畫面要講得出來 */
  feature_added: boolean;
}

/**
 * 一格該怎麼呈現。
 *
 * 🛑 免費課【不給勾選框】。對免費課做個別開放不會改變任何人看得到什麼，
 *    只會在資料庫留下一列沒有意義的授權，然後下一個人來看會以為它有作用。
 */
export type CellMode = "free" | "toggle";

export function cellMode(course: MatrixCourse): CellMode {
  return course.access === "FREE" ? "free" : "toggle";
}

/** 繼承來源的說明文字。null = 沒有繼承，不必顯示 */
export function inheritedLabel(cell: MatrixCell | undefined): string | null {
  if (!cell) return null;
  if (cell.via_class) return `${cell.via_class}（班級）`;
  return null;
}
