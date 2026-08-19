'use client';

import { useStore } from '@/lib/store-context';

export default function DashboardHome() {
  const { store } = useStore();
  if (!store) return null;

  const serverUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5002';
  const snippet = `<script src="${serverUrl}/widget.js" data-store-key="${store.widgetKey}"><\/script>`;

  return (
    <div className="max-w-3xl space-y-6">
      <h2 className="text-2xl font-bold">Overview</h2>

      <div className="bg-white rounded-xl border p-6 space-y-4">
        <h3 className="font-semibold text-lg">Store Details</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Name</span>
            <p className="font-medium">{store.name}</p>
          </div>
          <div>
            <span className="text-gray-500">Shopify URL</span>
            <p className="font-medium">{store.shopifyUrl}</p>
          </div>
          <div>
            <span className="text-gray-500">Widget Key</span>
            <p className="font-mono text-xs bg-gray-100 p-1 rounded">{store.widgetKey}</p>
          </div>
          <div>
            <span className="text-gray-500">Created</span>
            <p className="font-medium">{new Date(store.createdAt).toLocaleDateString()}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border p-6 space-y-4">
        <h3 className="font-semibold text-lg">Embed Widget</h3>
        <p className="text-sm text-gray-500">
          Add this script tag to your Shopify theme (before &lt;/body&gt; in theme.liquid):
        </p>
        <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm overflow-x-auto">
          {snippet}
        </div>
        <button
          onClick={() => navigator.clipboard.writeText(snippet)}
          className="text-sm text-primary hover:underline"
        >
          Copy to clipboard
        </button>
      </div>

      <div className="bg-white rounded-xl border p-6">
        <h3 className="font-semibold text-lg mb-4">Quick Setup</h3>
        <ol className="list-decimal list-inside space-y-2 text-sm text-gray-600">
          <li>Configure your drawer settings using the sidebar menu</li>
          <li>Customize colors to match your brand</li>
          <li>Set up announcements, reward bar, and upsells</li>
          <li>Add the embed snippet to your Shopify theme</li>
          <li>Test the drawer on your store</li>
        </ol>
      </div>
    </div>
  );
}
