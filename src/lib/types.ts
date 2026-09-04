export type Status = "muon_den" | "da_den";
export type TasteRating = "ngon" | "khong_ngon";
export type PriceLevel = "re" | "binh_thuong" | "dat";
export type GeocodeSource = "nominatim" | "plus_code" | "manual" | "unset";
export type LocationVerification = "verified" | "unverified" | "closed";

export type Collection = {
  id: string;
  name: string;
  icon: string;
  type: "food" | "cafe" | "all";
  owner_name: string;
  source_type: "manual" | "excel" | "google_sheets";
  google_sheets_url?: string | null;
  description?: string | null;
  is_default?: boolean;
  sort_order?: number;
  created_at?: string;
  updated_at?: string;
};

export type Ward = {
  id: string;
  name: string;
  type: "phuong" | "xa";
  old_names?: string[] | null;
};

export type Restaurant = {
  id: string;
  name: string;
  shop_note: string | null;
  address_raw: string | null;
  lat: number | null;
  lng: number | null;
  geocode_source: GeocodeSource;
  geocode_confidence: "high" | "medium" | "low" | "manual";
  ward_id: string | null;
  category: string | null;
  price_level: PriceLevel | null;
  taste_rating: TasteRating | null;
  status: Status;
  last_visited_at: string | null;
  visit_count: number;
  notes: string | null;
  is_duplicate_of: string | null;
  location_verification: LocationVerification;
  last_verified_at: string | null;
  next_review_at: string | null;
  created_at: string;
  updated_at: string;
  collection_id?: string | null;
  admin_wards?: Ward | null;
};

export type ReviewQueueItem = {
  id: string;
  restaurant_id: string;
  reason: string;
  due_at: string;
  status: "open" | "resolved";
  created_at: string;
  restaurants?: Restaurant | null;
};

export type VisitLog = {
  id: string;
  restaurant_id: string;
  visited_at: string;
  taste_rating: TasteRating | null;
  price_level: PriceLevel | null;
  note: string | null;
  created_at: string;
};

export type RestaurantDraft = {
  name: string;
  address_raw: string;
  category: string;
  notes: string;
  status: Status;
  taste_rating: "ngon" | "khong_ngon" | "";
  coordinates: string;
  collection_id?: string | null;
};
