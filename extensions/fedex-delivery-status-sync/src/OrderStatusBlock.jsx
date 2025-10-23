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
  // @ts-ignore
  const fulfillments = Array.isArray(order?.fulfillments) ? order.fulfillments : [];
  console.log('fulfillments', fulfillments);
  const fullyDelivered =
    fulfillments.length > 0 && fulfillments.every((f) => f?.status === 'DELIVERED');
  console.log('fullyDelivered', fullyDelivered);

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
          body: JSON.stringify({ orderId }),
        });

        let data;
        try {
          data = await res.json();
          console.log('data: ', data);
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
  }, [orderId, fullyDelivered]);

  return (
    <s-banner heading="FedEx Delivery Status Sync"
      tone={error ? 'critical' : loading ? 'info' : 'success'}>
      <s-stack gap="base">
        <s-text>
          {loading
            ? `Fetching tracking for ${orderName ?? 'this order'}…`
            : error
              ? error
              : null}
        </s-text>

        {!loading && !error && trackingData && (
          <>
            <s-text>allDelivered: {trackingData.allDelivered ? 'Yes' : 'No'}</s-text>

            {Array.isArray(trackingData.fulfillmentSummaries) &&
              trackingData.fulfillmentSummaries.length > 0 ? (
              trackingData.fulfillmentSummaries.map((f) => (
                <s-stack key={f.fulfillmentId}
                  // @ts-ignore
                  gap="tight">
                  <s-text>
                    FulfillmentId: {f.fulfillmentId}
                  </s-text>
                  {Array.isArray(f.tracks) && f.tracks.map((t) => (
                    <s-stack key={`${f.fulfillmentId}-${t.number}`} gap="none">
                      <s-text>Tracking Number: {t.number}</s-text>
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
