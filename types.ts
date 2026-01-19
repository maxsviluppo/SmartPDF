
export interface FormField {
  id: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'boolean' | 'email';
  placeholder?: string;
  value: string | boolean;
}

export interface PageData {
  pageNumber: number;
  image: string;
  fields: FormField[];
  title: string;
}

export interface PDFPageThumbnail {
  pageNumber: number;
  thumbnail: string;
  selected: boolean;
}

export enum AppState {
  IDLE,
  SELECTING_PAGES,
  PROCESSING,
  EDITING,
  EXPORTING
}
