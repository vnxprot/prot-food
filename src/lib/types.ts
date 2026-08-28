export type Status = "muon_den" | "da_den";
// Legacy data may still contain "binh_thuong". The simplified UI no longer writes it.
export type TasteRating = "ngon" | "binh_thuong" | "khong_ngon";
export type PriceLevel = "re" | "binh_thuong" | "dat";
export type GeocodeSource = "nominatim" | "manual" | "unset";

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
  geocode_confidence: "high" | "low" | "manual";
  ward_id: string | null;
  category: string | null;
  price_level: PriceLevel | null;
  taste_rating: TasteRating | null;
  status: Status;
  last_visited_at: string | null;
  visit_count: number;
  notes: string | null;
  is_duplicate_of: string | null;
  created_at: string;
  updated_at: string;
  admin_wards?: Ward | null;
};

export type RestaurantDraft = {
  name: string;
  address_raw: string;
  notes: string;
  status: Status;
  taste_rating: "ngon" | "khong_ngon" | "";
  coordinates: string;
};
