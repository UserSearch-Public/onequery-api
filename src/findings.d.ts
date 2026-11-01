export interface Finding { sources?: string[]; attributes?: Record<string, unknown>; [field: string]: unknown }
export interface Account extends Finding {
  platform?: string; platform_name?: string; url?: string; id?: string; username?: string;
  display_name?: string; first_name?: string; last_name?: string; bio?: string; location?: string;
  avatar?: string; banner?: string; website?: string; emails?: string[]; email_hints?: string[];
  phones?: string[]; phone_hints?: string[]; created_at?: string; updated_at?: string; last_seen_at?: string;
  metrics?: Record<string, number>; flags?: Record<string, boolean>;
  activity?: { date?: string; type?: string; text?: string; url?: string }[];
  photos?: { url?: string; thumbnail?: string; title?: string; taken_at?: string }[];
}
export interface Breach extends Finding {
  name?: string; domain?: string; breached_at?: string; added_at?: string; account_count?: number;
  data_classes?: string[]; description?: string; logo?: string;
  exposed?: { names?: string[]; usernames?: string[]; emails?: string[]; email_hints?: string[];
    phones?: string[]; phone_hints?: string[]; ip_addresses?: string[]; password?: boolean; other?: Record<string, string[]> };
}
export interface Domain extends Finding {
  domain?: string; registrar?: string; created_at?: string; updated_at?: string; expires_at?: string;
  registrant?: { name?: string; organization?: string; email?: string; phone?: string; location?: string };
}
export interface Fact extends Finding { topic?: string; data?: Record<string, unknown> }
export interface TimelineEvent extends Finding { date?: string; event?: 'account_created' | 'profile_updated' | 'last_seen' | 'data_breach' | 'domain_registered'; platform?: string; detail?: string }
export interface ImageMatch extends Finding {
  kind?: 'face' | 'image'; url?: string; domain?: string; platform?: string; name?: string;
  /** Similarity from 0 to 1, not a percentage. */
  score?: number;
  thumbnail?: string; image_url?: string; seen_at?: string; pages?: { url?: string; image_url?: string; seen_at?: string }[];
}
export interface ImageLocation extends Finding { name?: string; city?: string; region?: string; country?: string; latitude?: number; longitude?: number; confidence?: number; reasoning?: string; map_url?: string }
export interface SeenValue { value?: string; seen_on?: string[]; breaches?: string[] }
export interface Summary {
  counts?: Record<string, number>; names?: SeenValue[]; usernames?: SeenValue[]; emails?: SeenValue[];
  email_hints?: SeenValue[]; phones?: SeenValue[]; phone_hints?: SeenValue[]; locations?: SeenValue[];
  avatars?: SeenValue[]; websites?: SeenValue[]; top_domains?: { domain?: string; matches?: number }[]; best_location?: ImageLocation;
}
export interface Findings {
  summary?: Summary; accounts?: Account[]; registrations?: Account[]; breaches?: Breach[];
  domains?: Domain[]; facts?: Fact[]; timeline?: TimelineEvent[]; matches?: ImageMatch[]; locations?: ImageLocation[];
  [field: string]: unknown;
}
