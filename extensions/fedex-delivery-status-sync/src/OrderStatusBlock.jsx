import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';

export default async () => {
  render(<Extension />, document.body);
};

function Extension() {
  const order = shopify.order?.value || {};
  // @ts-ignore
  const orderId = order?.id;
  // @ts-ignore
  const orderName = order?.name;

  // prevent crash if processedAt missing
  // @ts-ignore
  const processedAt = order?.processedAt || '';
  const shipDateBegin = processedAt.includes('T') ? processedAt.split('T')[0] : undefined;

  // @ts-ignore
  const fulfillments = Array.isArray(order?.fulfillments) ? order.fulfillments : [];
  const fullyDelivered =
    fulfillments.length > 0 && fulfillments.every((f) => f?.status === 'DELIVERED');

  const [trackingData, setTrackingData] = useState(null);
  const [loading, setLoading] = useState(!fullyDelivered);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!orderId || fullyDelivered) return;

    let cancelled = false;
    const ctrl = new AbortController();

    const fetchWithRetry = async (url, init, retries = 1) => {
      try {
        const res = await fetch(url, { ...init, signal: ctrl.signal });
        if (res.status === 429 && retries > 0) {
          await new Promise((r) => setTimeout(r, 600));
          return fetchWithRetry(url, init, retries - 1);
        }
        return res;
      } catch (e) {
        if (cancelled) return new Response(null, { status: 499 });
        throw e;
      }
    };

    (async () => {
      try {
        const origin = 'https://emerileverydaydev.myshopify.com';
        const url = new URL('/apps/fedex-status/tracking', origin);
        url.searchParams.set('_fd', '0');
        url.searchParams.set('pb', '0');

        const res = await fetchWithRetry(url.toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId, ...(shipDateBegin ? { shipDateBegin } : {}) }),
        });

        let data;
        try {
          data = await res.json();
        } catch {
          throw new Error(
            'Non-JSON response (possible redirect). Check App Proxy, CORS/OPTIONS, and storefront password.'
          );
        }

        if (!cancelled) setTrackingData(data);
      } catch (e) {
        if (!cancelled) setError(e?.message ?? 'Failed to load tracking.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [orderId, shipDateBegin, fullyDelivered]);

  return (
    <s-banner heading="FedEx Delivery Status Sync"
      tone={error ? 'critical' : loading ? 'info' : 'success'}>
      <s-stack gap="base">
        <s-text>
          {loading
            ? `Fetching tracking for ${orderName ?? 'this order'}…`
            : error
              ? error
              : 'FedEx Tracking Information:'}
        </s-text>

        {!loading && !error && trackingData && (
          <>
            {trackingData.order && trackingData.order.name && (
              <s-text>Order: {trackingData.order.name}</s-text>
            )}

            {Array.isArray(trackingData.fulfillmentSummaries) &&
              trackingData.fulfillmentSummaries.length > 0 ? (
              trackingData.fulfillmentSummaries.map((f) => (
                <s-stack key={f.fulfillmentId} 
// @ts-ignore
                gap="tight">
                  <s-text>
                    Fulfillment: {f.fulfillmentId.split('/').pop()} —{' '}
                    {f.allDelivered ? 'Delivered' : 'In transit'}
                  </s-text>
                  {Array.isArray(f.tracks) && f.tracks.map((t) => (
                    <s-stack key={`${f.fulfillmentId}-${t.number}`} gap="none">
                      <s-text>Tracking: {t.number}</s-text>
                      {t.statusDesc && <s-text>Status: {t.statusDesc}</s-text>}
                      {t.estimatedDelivery && (
                        <s-text>ETA: {new Date(t.estimatedDelivery).toLocaleString()}</s-text>
                      )}
                    </s-stack>
                  ))}
                </s-stack>
              ))
            ) : (
              <s-text>No tracking yet.</s-text>
            )}
          </>
        )}

        {fullyDelivered && (
          <s-text>This order is already marked delivered. No status check needed.</s-text>
        )}
      </s-stack>
    </s-banner>
  );
}
