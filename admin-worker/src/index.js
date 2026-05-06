/**
 * Smart AI Bot - Admin Worker
 * Beautiful UI & backend to populate the DB via db-worker.
 */

async function queryDB(request, env, sql, params = []) {
  const payload = { sql, params };
  
  const url = new URL(request.url);
  const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  
  if (isLocal || !env.DB_WORKER) {
    const res = await fetch(`${env.LOCAL_DB_URL}/api/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.DB_SECRET_TOKEN}`
      },
      body: JSON.stringify(payload)
    });
    
    const text = await res.text();
    try {
        return JSON.parse(text);
    } catch(err) {
        throw new Error(`DB Fetch Error (Local): ` + text);
    }
  } else {
    const req = new Request("http://db-worker/api/query", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.DB_SECRET_TOKEN}`
      },
      body: JSON.stringify(payload)
    });
    // This requires the service binding env.DB_WORKER
    const res = await env.DB_WORKER.fetch(req);
    
    const text = await res.text();
    try {
        return JSON.parse(text);
    } catch(err) {
        throw new Error(`DB Fetch Error (Service Binding): ` + text);
    }
  }
}

function getCookie(request, name) {
  const cookieString = request.headers.get("Cookie");
  if (!cookieString) return null;
  const cookies = cookieString.split("; ");
  for (let c of cookies) {
    const [k, v] = c.split("=");
    if (k === name) return decodeURIComponent(v);
  }
  return null;
}

const UI_HTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Smart AI Bot Admin</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        
        :root {
            --bg: #0f172a;
            --glass-bg: rgba(30, 41, 59, 0.7);
            --glass-border: rgba(255, 255, 255, 0.1);
            --primary: #3b82f6;
            --primary-hover: #2563eb;
            --text: #f8fafc;
            --text-muted: #94a3b8;
            --danger: #ef4444;
        }

        body {
            margin: 0;
            padding: 0;
            background-color: var(--bg);
            background-image: 
                radial-gradient(at 0% 0%, rgba(59, 130, 246, 0.15) 0px, transparent 50%),
                radial-gradient(at 100% 100%, rgba(139, 92, 246, 0.15) 0px, transparent 50%);
            color: var(--text);
            font-family: 'Inter', sans-serif;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
        }

        .glass {
            background: rgba(30, 41, 59, 0.6);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border: 1px solid rgba(255, 255, 255, 0.15);
            border-radius: 16px;
            box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.5);
            padding: 24px;
        }

        /* Layout */
        header {
            padding: 1.5rem;
            text-align: center;
            border-bottom: 1px solid rgba(255,255,255,0.05);
            background: linear-gradient(to right, rgba(15,23,42,0.8), rgba(30,41,59,0.8));
        }
        
        main {
            padding: 2rem;
            max-width: 1200px;
            margin: 0 auto;
            width: 100%;
            box-sizing: border-box;
            flex-grow: 1;
        }

        /* Typography */
        h1, h2, h3 { margin: 0 0 1.5rem 0; font-weight: 600; letter-spacing: -0.02em; }
        h2 { background: -webkit-linear-gradient(45deg, #60a5fa, #a78bfa); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        p { margin: 0 0 1rem 0; color: var(--text-muted); line-height: 1.6; }
        
        label {
            display: block;
            margin-bottom: 0.5rem;
            font-size: 0.85rem;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: var(--text-muted);
            font-weight: 600;
        }

        /* Forms & Buttons */
        input, select, textarea {
            width: 100%;
            padding: 0.875rem 1rem;
            background: rgba(0, 0, 0, 0.2);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 8px;
            color: var(--text);
            font-family: inherit;
            margin-bottom: 1.5rem;
            box-sizing: border-box;
            transition: all 0.2s ease;
            font-size: 1rem;
        }
        input:focus, select:focus, textarea:focus {
            outline: none;
            border-color: var(--primary);
            box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.25);
            background: rgba(0, 0, 0, 0.4);
        }

        button {
            background: linear-gradient(to right, #3b82f6, #2563eb);
            color: white;
            border: none;
            padding: 0.875rem 1.5rem;
            border-radius: 8px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            box-shadow: 0 4px 14px 0 rgba(37, 99, 235, 0.39);
        }
        button:hover { 
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(37, 99, 235, 0.4);
        }
        button:active { transform: translateY(0); }
        
        .btn-secondary {
            background: rgba(255,255,255,0.1);
            color: var(--text);
            box-shadow: none;
        }
        .btn-secondary:hover {
            background: rgba(255,255,255,0.15);
            box-shadow: none;
        }

        /* Login Screen */
        #login-screen {
            max-width: 400px;
            margin: 4rem auto;
            text-align: center;
        }

        /* App Layout */
        #app-screen { display: none; }
        
        /* ── Nav Tabs ── */
        .nav-tabs {
            display: flex;
            gap: 0.5rem;
            margin-bottom: 2rem;
            background: rgba(0,0,0,0.25);
            padding: 0.4rem;
            border-radius: 14px;
            border: 1px solid rgba(255,255,255,0.07);
            width: 100%;
            box-sizing: border-box;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none;
        }
        .nav-tabs::-webkit-scrollbar { display: none; }

        .tab-btn {
            background: transparent;
            color: var(--text-muted);
            box-shadow: none;
            padding: 0.65rem 1.25rem;
            border-radius: 10px;
            font-weight: 500;
            font-size: 0.9rem;
            white-space: nowrap;
            flex-shrink: 0;
            transition: all 0.2s;
        }
        .tab-btn:hover { background: rgba(255,255,255,0.07); transform: none; color: var(--text); }
        .tab-btn.active {
            background: linear-gradient(135deg, rgba(59,130,246,0.3), rgba(139,92,246,0.2));
            color: var(--text);
            box-shadow: 0 2px 12px rgba(59,130,246,0.2);
            border: 1px solid rgba(59,130,246,0.3);
        }

        .tab-content { display: none; }
        .tab-content.active { display: block; animation: fadeIn 0.35s cubic-bezier(0.16, 1, 0.3, 1); }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(12px); }
            to { opacity: 1; transform: translateY(0); }
        }

        /* ── Tables ── */
        .table-header-flex {
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 0.75rem;
            margin-bottom: 1.25rem;
        }

        .tbl-wrap {
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            border-radius: 8px;
            margin-top: 0.25rem;
        }

        table {
            width: 100%;
            min-width: 480px;
            border-collapse: separate;
            border-spacing: 0;
        }
        th, td {
            padding: 1rem 0.9rem;
            text-align: left;
            border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        th {
            color: var(--text-muted);
            font-weight: 600;
            text-transform: uppercase;
            font-size: 0.75rem;
            letter-spacing: 0.06em;
            background: rgba(0,0,0,0.15);
            white-space: nowrap;
        }
        td { font-size: 0.92rem; }
        tr:hover td { background: rgba(255,255,255,0.02); }
        tr:last-child td { border-bottom: none; }

        /* Status badges */
        .badge {
            display: inline-flex;
            align-items: center;
            gap: 3px;
            padding: 3px 9px;
            border-radius: 20px;
            font-size: 0.75rem;
            font-weight: 600;
        }
        .badge-green  { background: rgba(16,185,129,0.15); color: #10b981; border: 1px solid rgba(16,185,129,0.2); }
        .badge-red    { background: rgba(239,68,68,0.12);  color: #ef4444; border: 1px solid rgba(239,68,68,0.2); }
        .badge-yellow { background: rgba(245,158,11,0.12); color: #f59e0b; border: 1px solid rgba(245,158,11,0.2); }
        .badge-gray   { background: rgba(148,163,184,0.1); color: var(--text-muted); border: 1px solid rgba(148,163,184,0.2); }

        /* ── Grid Layout ── */
        .grid-2 {
            display: grid;
            grid-template-columns: minmax(290px, 1fr) minmax(0, 2fr);
            gap: 1.5rem;
            align-items: start;
        }

        /* ── Responsive ── */
        @media (max-width: 960px) {
            .grid-2 { grid-template-columns: 1fr; }
        }
        @media (max-width: 600px) {
            main { padding: 1rem; }
            .glass { padding: 16px; border-radius: 12px; }
            .tab-btn { padding: 0.5rem 0.9rem; font-size: 0.82rem; }
            header h2 { font-size: 1.1rem; }
        }
    </style>
</head>
<body>

    <header>
        <h2 style="margin:0;">🚀 Smart AI Bot Admin</h2>
    </header>

    <main>
        <!-- LOGIN SCREEN -->
        <div id="login-screen" class="glass">
            <h3 style="font-size: 1.5rem;">Access Dashboard</h3>
            <p style="margin-bottom: 2rem;">Please enter your secure token</p>
            <form id="login-form">
                <input type="password" id="admin-pass" placeholder="Password" required style="text-align: center; letter-spacing: 2px;">
                <button type="submit" style="width: 100%; padding: 1rem;">Authenticate</button>
            </form>
            <p id="login-err" style="color: var(--danger); margin-top: 1rem; display: none; font-weight: 500;">Invalid password!</p>
        </div>

        <!-- APP SCREEN -->
        <div id="app-screen">
            <div class="nav-tabs">
                <button class="tab-btn active" onclick="showTab('products', this)">📦 Products</button>
                <button class="tab-btn" onclick="showTab('users', this)">👥 Users</button>
                <button class="tab-btn" onclick="showTab('accounts', this)">🔑 Accounts</button>
                <button class="tab-btn" onclick="showTab('subs', this)">💎 Subscriptions</button>
                <button class="tab-btn" onclick="showTab('providers', this)">🤖 AI Models</button>
            </div>

            <div id="tab-products" class="tab-content active">
                <div class="grid-2">
                    <div class="glass">
                        <h3 id="prod-form-title">Add New Product</h3>
                        <form id="add-product-form">
                            <input type="hidden" id="prod-id">
                            
                            <label>Platform Name (e.g., Netflix)</label>
                            <input type="text" id="prod-name" placeholder="Netflix Premium" required>
                            
                            <label>Base Price (Tk)</label>
                            <input type="number" id="prod-price" placeholder="450" required>
                            
                            <label>Renewable Product?</label>
                            <select id="prod-renew" style="margin-bottom: 1.5rem;">
                                <option value="1" selected>Yes (Renewable)</option>
                                <option value="0">No (Non-Renewable)</option>
                            </select>
                            
                            <label>Description / Details</label>
                            <textarea id="prod-desc" rows="3" placeholder="1 Month, 1 Screen Ultra HD" required></textarea>
                            
                            <div style="display: flex; gap: 0.5rem; margin-top: 1rem;">
                                <button type="submit" id="prod-submit-btn" style="flex: 1;">Add to Database ➔</button>
                                <button type="button" id="prod-cancel-btn" class="btn-secondary" style="display: none;" onclick="resetProdForm()">Cancel</button>
                            </div>
                        </form>
                    </div>
                    <div class="glass">
                        <div class="table-header-flex">
                            <h3 style="margin: 0;">Current Products</h3>
                            <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
                                <input type="text" id="prod-search" placeholder="Search..." style="margin: 0; padding: 0.5rem 0.75rem; width: 160px; font-size: 0.88em;" onkeyup="if(event.key === 'Enter') loadProducts(1)">
                                <button class="btn-secondary" onclick="loadProducts(1)" style="padding: 0.5rem 0.75rem; font-size: 0.88em;">🔍</button>
                            </div>
                        </div>
                        <div class="tbl-wrap">
                            <table>
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>Name</th>
                                        <th>Price</th>
                                        <th>Renewable</th>
                                        <th>Description</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody id="products-table-body">
                                    <tr><td colspan="6" style="text-align: center; padding: 3rem;">Loading...</td></tr>
                                </tbody>
                            </table>
                        </div>
                        <div id="products-pagination" style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem; align-items: center;">
                            <button class="btn-secondary" id="prod-prev-btn" onclick="changeProdPage(-1)" style="padding: 0.4rem 1rem;" disabled>Prev</button>
                            <span id="prod-page-indicator" style="font-size: 0.85em; color: var(--text-muted);">Page 1</span>
                            <button class="btn-secondary" id="prod-next-btn" onclick="changeProdPage(1)" style="padding: 0.4rem 1rem;">Next</button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- USERS TAB -->
            <div id="tab-users" class="tab-content">
                <div class="grid-2">
                    <div class="glass">
                        <h3>Add User (Manual)</h3>
                        <form id="add-user-form">
                            <label>Telegram Name <span style="color:var(--danger)">*</span></label>
                            <input type="text" id="add-user-name" placeholder="John Doe" required>
                            
                            <label>Email Address (Optional)</label>
                            <input type="email" id="add-user-email" placeholder="john@example.com">
                            
                            <label>Telegram Username (Optional)</label>
                            <div style="display: flex; align-items: center; margin-bottom: 1.5rem;">
                                <span style="background: rgba(0,0,0,0.3); padding: 0.875rem 1rem; border: 1px solid rgba(255, 255, 255, 0.1); border-right: none; border-radius: 8px 0 0 8px;">@</span>
                                <input type="text" id="add-user-username" placeholder="johndoe" style="margin-bottom: 0; border-radius: 0 8px 8px 0;">
                            </div>
                            
                            <label>Telegram System ID (Optional)</label>
                            <input type="number" id="add-user-id" placeholder="123456789">
                            
                            <button type="submit" id="user-submit-btn" style="width: 100%;">Add User ➔</button>
                        </form>
                    </div>
                    <div class="glass">
                        <div class="table-header-flex">
                            <h3 style="margin: 0;">Registered Users</h3>
                            <button class="btn-secondary" onclick="refreshTab('users')" style="padding: 0.5rem 1rem; font-size: 0.9em;">🔄 Refresh</button>
                        </div>
                        <div class="tbl-wrap">
                            <table>
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>Telegram ID</th>
                                        <th>Username</th>
                                        <th>Name</th>
                                        <th>Email</th>
                                        <th>Type</th>
                                    </tr>
                                </thead>
                                <tbody id="users-table-body">
                                    <tr><td colspan="6">Loading...</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            <!-- ACCOUNTS TAB -->
            <div id="tab-accounts" class="tab-content">
                <div class="grid-2">
                    <div class="glass">
                        <h3 id="acc-form-title">Add Service Account</h3>
                        <form id="add-account-form">
                            <input type="hidden" id="acc-id">
                            <label>Product / Platform</label>
                            <select id="acc-product" required></select>
                            
                            <label>Account Name / Group (e.g. Netflix Batch 1)</label>
                            <input type="text" id="acc-name" placeholder="Netflix Batch 1" required>
                            
                            <label>Login Username / Email</label>
                            <input type="text" id="acc-username" required>
                            
                            <label>Password</label>
                            <input type="text" id="acc-password" required>
                            
                            <label>Status</label>
                            <select id="acc-status">
                                <option value="active" selected>🟢 Active</option>
                                <option value="suspended">🔴 Suspended</option>
                                <option value="inactive">⚪ Inactive</option>
                            </select>
                            
                            <div style="display: flex; gap: 0.5rem; margin-top: 1rem;">
                                <button type="submit" id="acc-submit-btn" style="flex: 1;">Save Account ➔</button>
                                <button type="button" id="acc-cancel-btn" class="btn-secondary" style="display: none;" onclick="resetAccForm()">Cancel</button>
                            </div>
                        </form>
                    </div>
                    <div class="glass">
                        <div class="table-header-flex">
                            <h3 style="margin: 0;">Stored Accounts</h3>
                            <button class="btn-secondary" onclick="refreshTab('accounts')" style="padding: 0.5rem 1rem; font-size: 0.9em;">🔄 Refresh</button>
                        </div>
                        <div class="tbl-wrap">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Product</th>
                                        <th>Name</th>
                                        <th>Login</th>
                                        <th>Password</th>
                                        <th>Status</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody id="accounts-table-body">
                                    <tr><td colspan="6" style="text-align: center;">Loading...</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            <!-- SUBSCRIPTIONS TAB -->
            <div id="tab-subs" class="tab-content">
                <div class="grid-2">
                    <div class="glass">
                        <h3 id="sub-form-title">Assign Subscription</h3>
                        <form id="add-sub-form">
                            <input type="hidden" id="sub-id">
                            
                            <label>Assign To (User)</label>
                            <div style="display:flex; gap:0.5rem; margin-bottom:1rem;">
                                <select id="sub-user-select" style="margin-bottom:0; flex: 2;"></select>
                                <button type="button" class="btn-secondary" style="flex:1; padding:0; font-size: 0.85em;" onclick="document.getElementById('new-user-fields').style.display='block'; this.style.display='none'; document.getElementById('sub-user-select').value='';">➕ Add New</button>
                            </div>
                            
                            <div id="new-user-fields" style="display:none; background: rgba(0,0,0,0.2); padding: 10px; border-radius: 8px; margin-bottom: 1rem;">
                                <label style="font-size: 0.75em;">Telegram Name *</label>
                                <input type="text" id="sub-new-user-name" placeholder="John Doe">
                                <label style="font-size: 0.75em;">Username (optional)</label>
                                <input type="text" id="sub-new-user-username" placeholder="johndoe">
                            </div>
                            
                            <label>Select Product</label>
                            <select id="sub-product" required onchange="populateAccountsForProduct()"></select>

                            <label>Link Account (Credentials)</label>
                            <select id="sub-account"></select>

                            <div style="display:flex; gap:1rem; margin-bottom: 1rem;">
                                <div style="flex:1;">
                                    <label>Profile Name (Optional)</label>
                                    <input type="text" id="sub-profile" style="margin-bottom:0;" placeholder="Profile 1">
                                </div>
                                <div style="flex:1;">
                                    <label>Profile PIN (Optional)</label>
                                    <input type="text" id="sub-pin" style="margin-bottom:0;" placeholder="1234">
                                </div>
                            </div>
                            
                            <div style="display:flex; gap:1rem;">
                                <div style="flex:1;">
                                    <label>Purchase Date</label>
                                    <input type="date" id="sub-purchase-date" required>
                                </div>
                                <div style="flex:1;">
                                    <label>Expiry Date</label>
                                    <input type="date" id="sub-expiry-date" required>
                                </div>
                            </div>
                            
                            <label>Purchase Amount (Tk)</label>
                            <input type="number" id="sub-amount" required>

                            <label>Status</label>
                            <select id="sub-status">
                                <option value="active" selected>🟢 Active</option>
                                <option value="inactive">🔴 Inactive</option>
                                <option value="paused">⏸ Paused</option>
                            </select>

                            <div style="display: flex; gap: 0.5rem; margin-top: 1rem;">
                                <button type="submit" id="sub-submit-btn" style="flex: 1;">Assign Sub ➔</button>
                                <button type="button" id="sub-cancel-btn" class="btn-secondary" style="display: none;" onclick="resetSubForm()">Cancel</button>
                            </div>
                        </form>
                    </div>
                    <div class="glass">
                        <div class="table-header-flex">
                            <h3 style="margin: 0;">Active Subscriptions</h3>
                            <button class="btn-secondary" onclick="refreshTab('subs')" style="padding: 0.5rem 1rem; font-size: 0.9em;">🔄 Refresh</button>
                        </div>
                        <div class="tbl-wrap">
                            <table>
                                <thead>
                                    <tr>
                                        <th>User</th>
                                        <th>Product</th>
                                        <th>Account</th>
                                        <th>Expiry</th>
                                        <th>Status</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody id="subs-table-body">
                                    <tr><td colspan="6" style="text-align: center;">Loading...</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            <!-- AI PROVIDERS TAB -->
            <div id="tab-providers" class="tab-content">
                <div class="glass">
                    <div class="table-header-flex">
                        <h3 style="margin: 0;">AI Fallback Sequence &amp; Models</h3>
                        <button class="btn-secondary" onclick="refreshTab('providers')" style="padding: 0.5rem 1rem; font-size: 0.9em;">🔄 Refresh</button>
                    </div>
                    <p style="font-size: 0.85em; margin-bottom: 20px;">Activate your preferred AI provider. If multiple are active, the one at the top (Priority 1) will run first. Use the 🔼 🔽 arrows to change the order.</p>
                    <div class="tbl-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>Order</th>
                                    <th>Name</th>
                                    <th>Model Engine</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody id="providers-table-body">
                                <tr><td colspan="5" style="text-align: center;">Loading...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

        </div>
    </main>

    <script>
        // ── State ─────────────────────────────────────────────────────────────
        let currentProducts = [];
        let allProducts = [];
        let currentProdPage = 1;
        let currentProviders = [];

        let currentAccounts = [];
        let currentSubs = [];
        let currentUsers = [];

        // Cache flags — tracks which tabs have already loaded data
        const tabLoaded = { products: false, users: false, accounts: false, subs: false, providers: false };

        // Map tab id → loader function (called lazily)
        const tabLoaders = {
            products: () => loadProducts(),
            users:    () => loadUsers(),
            accounts: () => loadAccounts(),
            subs:     () => loadSubs(),
            providers: () => loadProviders()
        };

        // ── Boot ──────────────────────────────────────────────────────────────
        if (document.cookie.includes('auth=true')) {
            document.getElementById('login-screen').style.display = 'none';
            document.getElementById('app-screen').style.display = 'block';
            // Only load the initially active tab (Products)
            loadTabData('products');
        }

        // ── Login Logic ───────────────────────────────────────────────────────
        document.getElementById('login-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const pass = document.getElementById('admin-pass').value;
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ password: pass })
            });
            const data = await res.json();
            if (data.success) {
                document.cookie = "auth=true; path=/; max-age=86400"; // 1 day
                window.location.reload();
            } else {
                document.getElementById('login-err').style.display = 'block';
            }
        });

        // ── Tab Engine ────────────────────────────────────────────────────────
        /**
         * Switches active tab. If the tab's data hasn't been fetched yet,
         * fetches it now (lazy load). Subsequent switches use the cache.
         */
        function showTab(id, btnEl) {
            document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
            document.getElementById('tab-' + id).classList.add('active');
            if (btnEl) btnEl.classList.add('active');

            // Lazy load: only fetch if not already loaded
            if (!tabLoaded[id]) {
                loadTabData(id);
            }
        }

        /** Calls the loader for a tab and marks it as loaded. */
        function loadTabData(id) {
            if (tabLoaders[id]) {
                tabLoaders[id]();
                tabLoaded[id] = true;
            }
        }

        /**
         * Manual Refresh — busts the cache for a specific tab and re-fetches.
         * Called by each tab's 🔄 Refresh button.
         */
        function refreshTab(id) {
            tabLoaded[id] = false;
            loadTabData(id);
        }

        // API calls
        async function fetchApi(url, method='GET', body=null) {
            const opts = { method, headers: {'Content-Type': 'application/json'} };
            if (body) opts.body = JSON.stringify(body);
            
            try {
                const res = await fetch(url, opts);
                if (res.status === 401) {
                    document.cookie = "auth=; max-age=0";
                    window.location.reload();
                    return { error: 'Unauthorized' };
                }
                return await res.json();
            } catch (e) {
                console.error(e);
                return { error: e.message };
            }
        }

        // Load Products
        function changeProdPage(dir) {
            if (currentProdPage + dir > 0) {
                loadProducts(currentProdPage + dir);
            }
        }

        async function loadProducts(page = 1) {
            currentProdPage = page;
            const searchInput = document.getElementById('prod-search');
            const search = searchInput ? searchInput.value : '';
            const tbody = document.getElementById('products-table-body');
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Loading...</td></tr>';
            
            const data = await fetchApi('/api/products?page=' + page + '&search=' + encodeURIComponent(search));
            if (data.results) {
                currentProducts = data.results;
                
                const nextBtn = document.getElementById('prod-next-btn');
                const prevBtn = document.getElementById('prod-prev-btn');
                const pageIndicator = document.getElementById('prod-page-indicator');
                
                if (nextBtn) {
                    nextBtn.disabled = data.results.length < 10;
                    prevBtn.disabled = page === 1;
                    pageIndicator.innerText = 'Page ' + page;
                }

                tbody.innerHTML = data.results.map(p => 
                    \`<tr>
                        <td>\${p.id}</td>
                        <td><strong>\${p.name}</strong></td>
                        <td>\${p.base_price} Tk</td>
                        <td>\${p.is_renewable ? '<span style="color:#10b981;">Yes</span>' : '<span style="color:#ef4444;">No</span>'}</td>
                        <td>\${p.description}</td>
                        <td>
                            <button class="btn-secondary" style="padding: 0.4rem; font-size: 0.9em; margin-right: 4px;" onclick="editProduct(\${p.id})" title="Edit">✏️</button>
                            <button class="btn-secondary" style="padding: 0.4rem; font-size: 0.9em; color: var(--danger);" onclick="deleteProduct(\${p.id})" title="Delete">🗑️</button>
                        </td>
                    </tr>\`
                ).join('');
                if(data.results.length === 0) tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No products found</td></tr>';
            }
        }

        // Edit Product
        function editProduct(id) {
            const prod = currentProducts.find(p => p.id === id);
            if (!prod) return;
            
            document.getElementById('prod-id').value = prod.id;
            document.getElementById('prod-name').value = prod.name;
            document.getElementById('prod-price').value = prod.base_price;
            document.getElementById('prod-renew').value = prod.is_renewable || 0;
            document.getElementById('prod-desc').value = prod.description;
            
            document.getElementById('prod-form-title').innerText = "Edit Product";
            document.getElementById('prod-submit-btn').innerText = "Update Product ✓";
            document.getElementById('prod-cancel-btn').style.display = 'block';
            
            // Scroll to top
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        // Delete Product
        async function deleteProduct(id) {
            if (!confirm("Are you sure you want to delete this product?")) return;
            await fetchApi(\`/api/products?id=\${id}\`, 'DELETE');
            loadProducts(currentProdPage);
        }

        function resetProdForm() {
            document.getElementById('add-product-form').reset();
            document.getElementById('prod-id').value = "";
            document.getElementById('prod-name').value = "";
            document.getElementById('prod-price').value = "";
            document.getElementById('prod-desc').value = "";
            document.getElementById('prod-renew').value = 1;
            document.getElementById('prod-form-title').innerText = "Add New Product";
            document.getElementById('prod-submit-btn').innerText = "Add to Database ➔";
            document.getElementById('prod-cancel-btn').style.display = 'none';
        }

        // Submit Product (Add/Update)
        document.getElementById('add-product-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('prod-submit-btn');
            const originalText = btn.innerText;
            btn.innerText = 'Saving...';
            btn.disabled = true;

            const id = document.getElementById('prod-id').value;
            const name = document.getElementById('prod-name').value;
            const price = parseFloat(document.getElementById('prod-price').value);
            const renew = parseInt(document.getElementById('prod-renew').value || 0);
            const desc = document.getElementById('prod-desc').value;

            if (id) {
                await fetchApi('/api/products', 'PUT', { id: parseInt(id), name, base_price: price, is_renewable: renew, description: desc });
            } else {
                await fetchApi('/api/products', 'POST', { name, base_price: price, is_renewable: renew, description: desc });
            }
            
            resetProdForm();
            btn.disabled = false;
            loadProducts(currentProdPage);
        });

        // Load Users
        async function loadUsers() {
            const tbody = document.getElementById('users-table-body');
            tbody.innerHTML = '<tr><td colspan="6">Loading...</td></tr>';
            const data = await fetchApi('/api/users');
            if (data.results) {
                tbody.innerHTML = data.results.map(u => 
                    \`<tr>
                        <td>\${u.id}</td>
                        <td>\${u.telegram_id}</td>
                        <td>\${u.telegram_username ? '@'+u.telegram_username : '-'}</td>
                        <td>\${u.telegram_name || '-'}</td>
                        <td>\${u.email || '-'}</td>
                        <td><span style="background: var(--glass-bg); padding: 2px 8px; border-radius: 12px; font-size: 0.8em;">\${u.user_type}</span></td>
                    </tr>\`
                ).join('');
                if(data.results.length === 0) tbody.innerHTML = '<tr><td colspan="6">No users found</td></tr>';
            }
        }

        // Submit User (Manual Add)
        document.getElementById('add-user-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('user-submit-btn');
            btn.innerText = 'Saving...';
            btn.disabled = true;

            const name = document.getElementById('add-user-name').value;
            const email = document.getElementById('add-user-email').value || null;
            let username = document.getElementById('add-user-username').value || null;
            let tid = document.getElementById('add-user-id').value;
            
            // Clean up username
            if (username && username.startsWith('@')) username = username.substring(1);
            
            // Auto generate random mock tid if not provided, just so DB doesn't fail unique limit
            if (!tid) {
                tid = Math.floor(Math.random() * 90000000) + 10000000;
            } else {
                tid = parseInt(tid, 10);
            }

            const res = await fetchApi('/api/users', 'POST', {
                telegram_id: tid,
                telegram_username: username,
                telegram_name: name,
                email: email
            });

            if (res.error) {
                alert("Error adding user: " + res.error);
            } else {
                document.getElementById('add-user-form').reset();
            }
            
            btn.innerText = 'Add User ➔';
            btn.disabled = false;
            loadUsers();
        });

        // --- Accounts Logic ---
        async function loadAccounts() {
            const tbody = document.getElementById('accounts-table-body');
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Loading...</td></tr>';
            const data = await fetchApi('/api/accounts');
            if (data.results) {
                currentAccounts = data.results;
                
                // Populate Account dropdowns in Subscription tab
                await populateProductsSelects();

                tbody.innerHTML = data.results.map(a => {
                    const prod = allProducts.find(p => p.id === a.product_id);
                    return \`<tr>
                        <td>\${prod ? prod.name : 'Unknown'}</td>
                        <td><strong>\${a.name || '-'}</strong></td>
                        <td>\${a.account_username}</td>
                        <td style="font-family: monospace;">\${a.account_password}</td>
                        <td>\${a.status}</td>
                        <td>
                            <button class="btn-secondary" style="padding: 0.4rem; font-size: 0.9em; margin-right: 4px;" onclick="editAccount(\${a.id})" title="Edit">✏️</button>
                            <button class="btn-secondary" style="padding: 0.4rem; font-size: 0.9em; color: var(--danger);" onclick="deleteAccount(\${a.id})" title="Delete">🗑️</button>
                        </td>
                    </tr>\`;
                }).join('');
                if(data.results.length === 0) tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">No accounts found</td></tr>';
            }
        }

        async function populateProductsSelects() {
            if (allProducts.length === 0) {
                const pData = await fetchApi('/api/products?page=all');
                allProducts = pData.results || [];
            }
            const accSelect = document.getElementById('acc-product');
            const subSelect = document.getElementById('sub-product');
            if(!accSelect || !subSelect) return;
            const options = '<option value="" disabled selected>-- Select Product --</option>' + 
                            allProducts.map(p => \`<option value="\${p.id}">\${p.name}</option>\`).join('');
            accSelect.innerHTML = options;
            subSelect.innerHTML = options;
        }

        function editAccount(id) {
            const acc = currentAccounts.find(a => a.id === id);
            if (!acc) return;
            document.getElementById('acc-id').value = acc.id;
            document.getElementById('acc-product').value = acc.product_id;
            document.getElementById('acc-name').value = acc.name || '';
            document.getElementById('acc-username').value = acc.account_username;
            document.getElementById('acc-password').value = acc.account_password;
            document.getElementById('acc-status').value = acc.status;
            
            document.getElementById('acc-form-title').innerText = "Edit Account";
            document.getElementById('acc-submit-btn').innerText = "Update Account ✓";
            document.getElementById('acc-cancel-btn').style.display = 'block';
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        async function deleteAccount(id) {
            if (!confirm("Are you sure you want to delete this account?")) return;
            await fetchApi('/api/accounts?id=' + id, 'DELETE');
            refreshTab('accounts');
        }

        function resetAccForm() {
            document.getElementById('add-account-form').reset();
            document.getElementById('acc-id').value = "";
            document.getElementById('acc-form-title').innerText = "Add Service Account";
            document.getElementById('acc-submit-btn').innerText = "Save Account ➔";
            document.getElementById('acc-cancel-btn').style.display = 'none';
        }

        document.getElementById('add-account-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('acc-submit-btn');
            btn.innerText = 'Saving...'; btn.disabled = true;

            const id = document.getElementById('acc-id').value;
            const payload = {
                product_id: document.getElementById('acc-product').value,
                name: document.getElementById('acc-name').value,
                account_username: document.getElementById('acc-username').value,
                account_password: document.getElementById('acc-password').value,
                status: document.getElementById('acc-status').value
            };

            if (id) await fetchApi('/api/accounts', 'PUT', { id: parseInt(id), ...payload });
            else await fetchApi('/api/accounts', 'POST', payload);
            
            resetAccForm();
            btn.disabled = false;
            refreshTab('accounts');
        });

        // --- Subscriptions Logic ---
        function populateUsersSelect() {
            const select = document.getElementById('sub-user-select');
            if(!select) return;
            select.innerHTML = '<option value="" disabled selected>-- Select Existing User --</option>' + 
                               currentUsers.map(u => \`<option value="\${u.id}">\${u.telegram_name || u.telegram_username} (ID: \${u.id})</option>\`).join('');
        }

        function populateAccountsForProduct() {
            const pid = parseInt(document.getElementById('sub-product').value);
            const select = document.getElementById('sub-account');
            const filtered = currentAccounts.filter(a => a.product_id === pid);
            select.innerHTML = '<option value="" selected>-- No Account Assigned (Waiting) --</option>' + 
                               filtered.map(a => {
                                   let displayStr = a.name;
                                   if (a.account_username) displayStr += \` (\${a.account_username})\`;
                                   return \`<option value="\${a.id}">\${displayStr} (\${a.status})</option>\`;
                               }).join('');
        }

        async function loadSubs() {
            const tbody = document.getElementById('subs-table-body');
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Loading...</td></tr>';
            
            // Ensure products, users, accounts are loaded
            if(currentUsers.length === 0) { const ud = await fetchApi('/api/users'); currentUsers = ud.results || []; }
            if(currentAccounts.length === 0) { const ad = await fetchApi('/api/accounts'); currentAccounts = ad.results || []; }
            
            populateUsersSelect();
            await populateProductsSelects();

            const data = await fetchApi('/api/subscriptions');
            if (data.results) {
                currentSubs = data.results;
                tbody.innerHTML = data.results.map(s => {
                    const u = currentUsers.find(x => x.id === s.user_id) || {};
                    const p = allProducts.find(x => x.id === s.product_id) || {};
                    const a = currentAccounts.find(x => x.id === s.account_id) || {};
                    let accDisplay = '<span style="color:#f39c12; font-size:0.9em; font-weight:600;">⚠️ Not Assigned</span>';
                    if (a.id) {
                        accDisplay = \`<strong>\${a.name}</strong><br><span style="font-size:0.85em; color:var(--text-muted);">\${a.account_username || ''}</span>\`;
                    }
                    
                    return \`<tr>
                        <td><strong>\${u.telegram_name || 'Unknown'}</strong></td>
                        <td>\${p.name || '-'}</td>
                        <td>\${accDisplay}</td>
                        <td>\${new Date(s.expiry_date).toLocaleDateString() || '-'}</td>
                        <td>\${s.status}</td>
                        <td>
                            <button class="btn-secondary" style="padding: 0.4rem; font-size: 0.9em; margin-right: 4px;" onclick="editSub(\${s.id})" title="Edit">✏️</button>
                            <button class="btn-secondary" style="padding: 0.4rem; font-size: 0.9em; margin-right: 4px;" onclick="extendSub(\${s.id})" title="Extend Expiry">➕</button>
                            <button class="btn-secondary" style="padding: 0.4rem; font-size: 0.9em; color: var(--danger);" onclick="deleteSub(\${s.id})" title="Delete">🗑️</button>
                        </td>
                    </tr>\`;
                }).join('');
                if(data.results.length === 0) tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">No subscriptions found</td></tr>';
            }
        }

        function extendSub(id) {
            const sub = currentSubs.find(s => s.id === id);
            if(!sub) return;
            const extraDays = prompt("How many days to add to the expiry date?", "30");
            if(extraDays && !isNaN(extraDays)) {
                fetchApi('/api/subscriptions/extend', 'POST', { id, days: parseInt(extraDays) }).then(() => refreshTab('subs'));
            }
        }

        function editSub(id) {
            const sub = currentSubs.find(s => s.id === id);
            if (!sub) return;
            document.getElementById('sub-id').value = sub.id;
            document.getElementById('sub-user-select').value = sub.user_id;
            document.getElementById('new-user-fields').style.display = 'none';
            document.getElementById('sub-product').value = sub.product_id;
            populateAccountsForProduct();
            document.getElementById('sub-account').value = sub.account_id;
            document.getElementById('sub-profile').value = sub.profile_name || '';
            document.getElementById('sub-pin').value = sub.profile_pin || '';
            document.getElementById('sub-purchase-date').value = sub.purchase_date ? sub.purchase_date.split('T')[0] : '';
            document.getElementById('sub-expiry-date').value = sub.expiry_date ? sub.expiry_date.split('T')[0] : '';
            document.getElementById('sub-amount').value = sub.purchase_amount;
            document.getElementById('sub-status').value = sub.status;
            
            document.getElementById('sub-form-title').innerText = "Edit Subscription";
            document.getElementById('sub-submit-btn').innerText = "Update Sub ✓";
            document.getElementById('sub-cancel-btn').style.display = 'block';
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        async function deleteSub(id) {
            if (!confirm("Are you sure you want to delete this subscription?")) return;
            await fetchApi('/api/subscriptions?id=' + id, 'DELETE');
            refreshTab('subs');
        }

        function resetSubForm() {
            document.getElementById('add-sub-form').reset();
            document.getElementById('sub-id').value = "";
            document.getElementById('sub-pin').value = "";
            document.getElementById('new-user-fields').style.display = 'none';
            document.getElementById('sub-form-title').innerText = "Assign Subscription";
            document.getElementById('sub-submit-btn').innerText = "Assign Sub ➔";
            document.getElementById('sub-cancel-btn').style.display = 'none';
        }

        document.getElementById('add-sub-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('sub-submit-btn');
            btn.innerText = 'Saving...'; btn.disabled = true;

            const id = document.getElementById('sub-id').value;
            const payload = {
                product_id: document.getElementById('sub-product').value,
                account_id: document.getElementById('sub-account').value || null,
                profile_name: document.getElementById('sub-profile').value,
                profile_pin: document.getElementById('sub-pin').value,
                purchase_date: document.getElementById('sub-purchase-date').value,
                expiry_date: document.getElementById('sub-expiry-date').value,
                purchase_amount: parseFloat(document.getElementById('sub-amount').value),
                status: document.getElementById('sub-status').value
            };

            const userSelect = document.getElementById('sub-user-select').value;
            if (userSelect === '_NEW_') {
                const name = document.getElementById('sub-new-user-name').value;
                let username = document.getElementById('sub-new-user-username').value;
                if (username && username.startsWith('@')) username = username.substring(1);
                payload.new_user = { telegram_name: name, telegram_username: username };
            } else {
                payload.user_id = userSelect;
            }

            if (id) await fetchApi('/api/subscriptions', 'PUT', { id: parseInt(id), ...payload });
            else await fetchApi('/api/subscriptions', 'POST', payload);
            
            resetSubForm();
            btn.disabled = false;
            refreshTab('subs');
            if (userSelect === '_NEW_') tabLoaded['users'] = false; // invalidate users tab cache
        });

        // --- Providers Logic ---
        async function loadProviders() {
            const tbody = document.getElementById('providers-table-body');
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">Loading...</td></tr>';
            const data = await fetchApi('/api/providers');
            if (data.results) {
                currentProviders = data.results;
                tbody.innerHTML = data.results.map((p, index) => 
                    \`<tr>
                        <td><strong>\${p.priority}</strong></td>
                        <td><strong>\${p.provider_name}</strong><br><span style="font-size:0.8em; color: var(--text-muted);">\${p.is_cloudflare ? 'Built-in CF' : 'External API'}</span></td>
                        <td><small style="background: rgba(0,0,0,0.3); padding: 4px 8px; border-radius: 4px;">\${p.model_id}</small></td>
                        <td>
                            <button onclick="toggleProvider(\${p.id}, \${p.is_active})" style="padding: 0.4rem 0.8rem; font-size: 0.85em; background: \${p.is_active ? 'var(--primary)' : 'rgba(255,255,255,0.1)'}; color: white; border-radius: 20px; box-shadow: none;">
                                \${p.is_active ? '🟢 Active' : '⚪ Paused'}
                            </button>
                        </td>
                        <td>
                            <button class="btn-secondary" style="padding: 0.4rem; font-size: 0.9em; margin-right: 4px; \${index === 0 ? 'opacity: 0.5; cursor: not-allowed;' : ''}" onclick="\${index !== 0 ? \`moveProvider(\${p.id}, 'up')\` : ''}" title="Move Up">🔼</button>
                            <button class="btn-secondary" style="padding: 0.4rem; font-size: 0.9em; margin-right: 4px; \${index === data.results.length - 1 ? 'opacity: 0.5; cursor: not-allowed;' : ''}" onclick="\${index !== data.results.length - 1 ? \`moveProvider(\${p.id}, 'down')\` : ''}" title="Move Down">🔽</button>
                        </td>
                    </tr>\`
                ).join('');
                if(data.results.length === 0) tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No providers configured</td></tr>';
            }
        }

        async function toggleProvider(id, currentStatus) {
            const newStatus = currentStatus ? 0 : 1;
            await fetchApi('/api/providers', 'PUT', { id, is_active: newStatus });
            loadProviders();
        }

        async function moveProvider(id, direction) {
            const currentIndex = currentProviders.findIndex(p => p.id === id);
            if (currentIndex === -1) return;
            
            const currentItem = currentProviders[currentIndex];
            let swapItem = null;

            if (direction === 'up' && currentIndex > 0) {
                swapItem = currentProviders[currentIndex - 1];
            } else if (direction === 'down' && currentIndex < currentProviders.length - 1) {
                swapItem = currentProviders[currentIndex + 1];
            }

            if (swapItem) {
                // Swap priorities
                const tempPrio = currentItem.priority;
                await fetchApi('/api/providers', 'PUT', { id: currentItem.id, priority: swapItem.priority });
                await fetchApi('/api/providers', 'PUT', { id: swapItem.id, priority: tempPrio });
                loadProviders();
            }
        }
    </script>
</body>
</html>
`;


export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);

      // 1. Frontend UI
      if (request.method === "GET" && url.pathname === "/") {
        return new Response(UI_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } });
      }

      // 2. Auth / Login (Unprotected intentionally to verify password)
      if (request.method === "POST" && url.pathname === "/api/login") {
        const body = await request.json();
        if (body.password === env.ADMIN_PASSWORD) {
          return Response.json({ success: true });
        }
        return Response.json({ success: false, error: "Invalid password" }, { status: 401 });
      }

      // --- PROTECTED API ENDPOINTS ---
      // Enforce basic cookie check and token protection
      const isLocalApiCallToSelf = (url.pathname.startsWith('/api/') && request.method !== "OPTIONS");
      if (isLocalApiCallToSelf) {
         const cookieAuth = getCookie(request, "auth");
         if (cookieAuth !== "true") {
             return Response.json({ error: "Unauthorized" }, { status: 401 });
         }
      }

    if (url.pathname === "/api/products") {
        if (request.method === "GET") {
            const pageParam = url.searchParams.get("page") || "1";
            if (pageParam === "all") {
                const result = await queryDB(request, env, "SELECT * FROM products ORDER BY id DESC");
                return Response.json(result);
            }
            const page = parseInt(pageParam, 10);
            const search = url.searchParams.get("search") || "";
            const limit = 10;
            const offset = (page - 1) * limit;
            
            let query = "SELECT * FROM products";
            let params = [];
            
            if (search.trim() !== "") {
                query += " WHERE name LIKE ?";
                params.push('%' + search.trim() + '%');
            }
            query += " ORDER BY id DESC LIMIT ? OFFSET ?";
            params.push(limit, offset);
            
            const result = await queryDB(request, env, query, params);
            return Response.json(result);
        }
        if (request.method === "POST") {
            const { name, base_price, description, is_renewable = 1 } = await request.json();
            const result = await queryDB(request, env, 
                "INSERT INTO products (name, base_price, description, is_renewable) VALUES (?, ?, ?, ?)",
                [name, base_price, description, is_renewable]
            );
            return Response.json(result);
        }
        if (request.method === "PUT") {
            const { id, name, base_price, description, is_renewable = 1 } = await request.json();
            const result = await queryDB(request, env, 
                "UPDATE products SET name=?, base_price=?, description=?, is_renewable=? WHERE id=?",
                [name, base_price, description, is_renewable, id]
            );
            return Response.json(result);
        }
        if (request.method === "DELETE") {
            const id = url.searchParams.get("id");
            if (!id) return Response.json({ error: "Missing ID" }, { status: 400 });
            const result = await queryDB(request, env, "DELETE FROM products WHERE id=?", [id]);
            return Response.json(result);
        }
    }
    
    // Users API
    if (url.pathname === "/api/users") {
        if (request.method === "GET") {
            const result = await queryDB(request, env, "SELECT * FROM users ORDER BY created_at DESC");
            return Response.json(result);
        }
        if (request.method === "POST") {
            const { telegram_id, telegram_username, telegram_name, email } = await request.json();
            try {
                const result = await queryDB(request, env, 
                    "INSERT INTO users (telegram_id, telegram_username, telegram_name, email, user_type) VALUES (?, ?, ?, ?, 'client')",
                    [telegram_id, telegram_username || null, telegram_name, email || null]
                );
                return Response.json(result);
            } catch (e) {
                return Response.json({ error: e.message }, { status: 400 });
            }
        }
    }
    
    // AI Providers API
    if (url.pathname === "/api/providers") {
        if (request.method === "GET") {
            const result = await queryDB(request, env, "SELECT id, provider_name, model_id, api_url, api_key, is_cloudflare, priority, is_active FROM ai_providers ORDER BY priority ASC, id ASC");
            return Response.json(result);
        }
        if (request.method === "POST") {
            const { provider_name, model_id, api_url, api_key, is_cloudflare, priority, is_active } = await request.json();
            const result = await queryDB(request, env, 
                "INSERT INTO ai_providers (provider_name, model_id, api_url, api_key, is_cloudflare, priority, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)",
                [provider_name, model_id, api_url, api_key, is_cloudflare, priority, is_active]
            );
            return Response.json(result);
        }
        if (request.method === "PUT") {
            const updates = await request.json();
            const id = updates.id;
            
            if (updates.is_active !== undefined) {
                await queryDB(request, env, "UPDATE ai_providers SET is_active=? WHERE id=?", [updates.is_active, id]);
            }
            if (updates.priority !== undefined) {
                await queryDB(request, env, "UPDATE ai_providers SET priority=? WHERE id=?", [updates.priority, id]);
            }
            return Response.json({ success: true });
        }
        if (request.method === "DELETE") {
            const id = url.searchParams.get("id");
            if (!id) return Response.json({ error: "Missing ID" }, { status: 400 });
            const result = await queryDB(request, env, "DELETE FROM ai_providers WHERE id=?", [id]);
            return Response.json(result);
        }
    }

    // Accounts API
    if (url.pathname === "/api/accounts") {
        if (request.method === "GET") {
            const result = await queryDB(request, env, "SELECT * FROM accounts ORDER BY created_at DESC");
            return Response.json(result);
        }
        if (request.method === "POST") {
            const { name, product_id, account_username, account_password, status } = await request.json();
            const result = await queryDB(request, env, 
                "INSERT INTO accounts (name, product_id, account_username, account_password, status) VALUES (?, ?, ?, ?, ?)",
                [name, product_id, account_username, account_password, status || 'active']
            );
            return Response.json(result);
        }
        if (request.method === "PUT") {
            const { id, name, product_id, account_username, account_password, status } = await request.json();
            const result = await queryDB(request, env, 
                "UPDATE accounts SET name=?, product_id=?, account_username=?, account_password=?, status=? WHERE id=?",
                [name, product_id, account_username, account_password, status, id]
            );
            return Response.json(result);
        }
        if (request.method === "DELETE") {
            const id = url.searchParams.get("id");
            if (!id) return Response.json({ error: "Missing ID" }, { status: 400 });
            const result = await queryDB(request, env, "DELETE FROM accounts WHERE id=?", [id]);
            return Response.json(result);
        }
    }

    // Subscriptions API
    if (url.pathname === "/api/subscriptions") {
        if (request.method === "GET") {
            // For now, order by creation or soonest to expire.
            const result = await queryDB(request, env, "SELECT * FROM subscriptions ORDER BY id DESC");
            return Response.json(result);
        }
        if (request.method === "POST") {
            const { new_user, user_id, product_id, account_id, profile_name, profile_pin, purchase_date, expiry_date, purchase_amount, status } = await request.json();
            let finalUserId = user_id;

            if (new_user) {
                // Auto generate temp telegram_id
                const tempTgId = Math.floor(Math.random() * 1000000000);
                const uRes = await queryDB(request, env, 
                    "INSERT INTO users (telegram_id, telegram_username, telegram_name, user_type) VALUES (?, ?, ?, 'client') RETURNING id",
                    [tempTgId, new_user.telegram_username || null, new_user.telegram_name]
                );
                finalUserId = uRes.results[0].id;
            }

            const result = await queryDB(request, env, 
                "INSERT INTO subscriptions (user_id, product_id, account_id, account_username, account_password, profile_name, profile_pin, purchase_date, expiry_date, purchase_amount, status) VALUES (?, ?, ?, '', '', ?, ?, ?, ?, ?, ?)",
                [finalUserId, product_id, account_id, profile_name || null, profile_pin || null, purchase_date, expiry_date, purchase_amount, status || 'active']
            );
            return Response.json(result);
        }
        if (request.method === "PUT") {
            const { id, user_id, product_id, account_id, profile_name, profile_pin, purchase_date, expiry_date, purchase_amount, status } = await request.json();
            const result = await queryDB(request, env, 
                "UPDATE subscriptions SET user_id=?, product_id=?, account_id=?, profile_name=?, profile_pin=?, purchase_date=?, expiry_date=?, purchase_amount=?, status=? WHERE id=?",
                [user_id, product_id, account_id, profile_name || null, profile_pin || null, purchase_date, expiry_date, purchase_amount, status, id]
            );
            return Response.json(result);
        }
        if (request.method === "DELETE") {
            const id = url.searchParams.get("id");
            if (!id) return Response.json({ error: "Missing ID" }, { status: 400 });
            const result = await queryDB(request, env, "DELETE FROM subscriptions WHERE id=?", [id]);
            return Response.json(result);
        }
    }

    if (request.method === "POST" && url.pathname === "/api/subscriptions/extend") {
        const { id, days } = await request.json();
        const result = await queryDB(request, env, 
            "UPDATE subscriptions SET expiry_date = datetime(expiry_date, '+' || ? || ' days') WHERE id = ?",
            [days, id]
        );
        return Response.json(result);
    }

    return new Response("Not Found", { status: 404 });
    } catch (err) {
      return Response.json({ error: err.stack || err.message }, { status: 500 });
    }
  }
};
