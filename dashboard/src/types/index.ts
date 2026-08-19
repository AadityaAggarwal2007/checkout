export interface User {
  id: string;
  email: string;
  name: string | null;
}

export interface Store {
  id: string;
  name: string;
  shopifyUrl: string;
  widgetKey: string;
  role?: string;
  createdAt: string;
}

export interface AnnouncementMessage {
  text: string;
}

export interface AnnouncementsConfig {
  enabled: boolean;
  messages: AnnouncementMessage[];
  duration: number;
}

export interface RewardTier {
  label: string;
  threshold: number;
  type: 'shipping' | 'product' | 'gift';
  icon?: string;
}

export interface RewardBarConfig {
  enabled: boolean;
  tiers: RewardTier[];
  template: string;
  countingMethod: 'total_value' | 'quantity';
  confetti: {
    enabled: boolean;
    template: string;
    trigger: string;
  };
}

export interface UpsellsConfig {
  enabled: boolean;
  title: string;
  mode: 'manual' | 'auto';
  type: 'products';
  productIds: string[];
  productHandles: string[];
  limit: number;
}

export interface AddonRule {
  id: string;
  triggerProductId: string;
  addonProductId: string;
  price: number | null;
}

export interface NotesConfig {
  enabled: boolean;
  position: 'body' | 'footer';
  title: string;
  placeholder: string;
  charLimit: number;
}

export interface ConfirmationConfig {
  enabled: boolean;
  text: string;
  checkboxEnabled: boolean;
  required: boolean;
}

export interface DiscountsConfig {
  enabled: boolean;
  mode: 'list' | 'input';
  position: 'body' | 'footer';
  codes: string[];
  invalidMessage: string;
  appliedMessage: string;
  confetti: {
    enabled: boolean;
    template: string;
    autoTrigger: boolean;
  };
}

export interface SettingsConfig {
  showComparePrice: boolean;
  showSavings: boolean;
  showVariantSelector: boolean;
  showProperties: boolean;
  openDrawerOnAdd: boolean;
  emptyCart: {
    title: string;
    description: string;
    buttonText: string;
    buttonUrl: string;
  };
}

export interface ColorsConfig {
  primary: string;
  text: string;
  background: string;
  accent: string;
}

export interface FreeGift {
  id: string;
  productId: string;
  threshold: number;
  triggerType: 'value' | 'quantity';
  label: string;
}

export interface DrawerConfig {
  announcements: AnnouncementsConfig;
  rewardBar: RewardBarConfig;
  upsells: UpsellsConfig;
  addons: AddonRule[];
  notes: NotesConfig;
  confirmation: ConfirmationConfig;
  discounts: DiscountsConfig;
  trustBadges: string[];
  freeGifts: FreeGift[];
  settings: SettingsConfig;
  colors: ColorsConfig;
}

export interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  images: { id: number; src: string }[];
  variants: {
    id: number;
    title: string;
    price: string;
    compare_at_price: string | null;
    sku: string;
  }[];
}

export interface Order {
  id: string;
  shopifyOrderId: string | null;
  customerPhone: string;
  customerEmail: string | null;
  customerName: string | null;
  address: Record<string, string>;
  items: Record<string, unknown>[];
  subtotal: string;
  discount: string;
  total: string;
  couponCode: string | null;
  paymentStatus: string;
  paymentMethod: string | null;
  createdAt: string;
}
