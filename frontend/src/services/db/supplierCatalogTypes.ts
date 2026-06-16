export type Id = string;

export type ApprovalStatus = 'draft' | 'pending_review' | 'approved' | 'rejected';

export type ImageDraft = {
  file?: File;
  previewUrl: string;
};

export type CategoryDraft = {
  id: Id;
  name: string;
  description: string;
  image: ImageDraft | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MoneyUSD = {
  amount: number;
  currency: string;
};

export type OptionItemDraft = {
  id: Id;
  label: string;
  priceDeltaUsd: number;
  isActive: boolean;
};

export type OptionGroupDraft = {
  id: Id;
  title: string;
  required: boolean;
  selection: 'single' | 'multi';
  /** Solo aplica cuando selection === 'multi'. null = sin límite superior. */
  maxSelections: number | null;
  items: OptionItemDraft[];
  isActive: boolean;
};

export type ProductDraft = {
  id: Id;
  name: string;
  description: string;
  price: MoneyUSD;
  discountUsd: number;
  image: ImageDraft | null;
  categoryIds: Id[];
  optionGroups: OptionGroupDraft[];
  approvalStatus: ApprovalStatus;
  isPublished: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};
