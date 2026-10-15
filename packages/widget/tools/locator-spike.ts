import { locate, resolve, routeKey, type LocatorBundle } from '../src/locators';

export interface Baseline {
  format: 'tuix-locator-spike-v1';
  release: string;
  route: string;
  capturedAt: string;
  samples: { id: number; locator: LocatorBundle }[];
}

export function baseline(elements: Element[], release: string, url = location.href): Baseline {
  return {
    format: 'tuix-locator-spike-v1', release, route: routeKey(url), capturedAt: new Date().toISOString(),
    samples: [...new Set(elements)].slice(0, 200).map((element, index) => ({ id: index + 1, locator: locate(element) })),
  };
}

export function replay(input: Baseline, release: string, root = document, url = location.href) {
  if (input.format !== 'tuix-locator-spike-v1' || input.route !== routeKey(url)) throw new Error('Open the baseline route before replaying.');
  if (!Array.isArray(input.samples) || !input.samples.length || input.samples.length > 200) throw new Error('Use a baseline with 1–200 elements.');
  const observations = input.samples.map(sample => {
    const result = resolve(sample.locator, root);
    return { id: sample.id, method: result.method, orphaned: result.orphaned,
      matchedTag: result.element?.tagName.toLowerCase() ?? null,
      matchedLocator: result.element ? locate(result.element) : null, confirmedMatch: null };
  });
  return {
    format: 'tuix-locator-observations-v1', baselineRelease: input.release, release,
    route: input.route, capturedAt: input.capturedAt, observedAt: new Date().toISOString(),
    total: observations.length, resolved: observations.filter(item => !item.orphaned).length,
    observations,
  };
}
