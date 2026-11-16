import type { MobilePage } from '../../../shared/mobile-contract';

export const CATALOGUE_MAX_PAGES = 8;
export const cataloguePageWindow = {
  maxPages: CATALOGUE_MAX_PAGES,
  getNextPageParam: (last: MobilePage) => last.page < last.pages ? last.page + 1 : undefined,
  getPreviousPageParam: (first: MobilePage) => first.page > 1 ? first.page - 1 : undefined,
};
