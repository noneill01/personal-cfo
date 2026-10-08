import type { UserProfile } from "./types.ts";

export type FeaturePackId = "uk-tax";

export const isFeaturePackEnabled = (profile: Pick<UserProfile,"enabledPacks"> | undefined, id: FeaturePackId) => profile?.enabledPacks?.includes(id) ?? false;

export function enableFeaturePack(profile: UserProfile, id: FeaturePackId): UserProfile {
  return isFeaturePackEnabled(profile,id) ? profile : {...profile,enabledPacks:[...(profile.enabledPacks??[]),id]};
}

export function disableFeaturePack(profile: UserProfile, id: FeaturePackId): UserProfile {
  return isFeaturePackEnabled(profile,id) ? {...profile,enabledPacks:(profile.enabledPacks??[]).filter(pack=>pack!==id)} : profile;
}

/** Keep feature visibility independent of a page's rendering details. */
export function visibleNavigation<T extends { target: string }>(items: readonly T[], profile?: Pick<UserProfile,"enabledPacks">): T[] {
  return items.filter(item=>item.target!=="Tax"||isFeaturePackEnabled(profile,"uk-tax"));
}
