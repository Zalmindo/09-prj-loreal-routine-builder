/* Get references to DOM elements */
const categoryFilter = document.getElementById("categoryFilter");
const productsContainer = document.getElementById("productsContainer");
const selectedProductsList = document.getElementById("selectedProductsList");
const clearSelectionsBtn = document.getElementById("clearSelections");
const generateRoutineBtn = document.getElementById("generateRoutine");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
const userInput = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");

const WORKER_URL = "https://openai-worker.zalmindo.workers.dev";
const STORAGE_KEY = "loreal-selected-product-ids";

let allProducts = [];
let currentCategory = "";
let selectedProductIds = new Set();
let conversationHistory = [];
let routineWasGenerated = false;

/* Show initial placeholder until user selects a category */
productsContainer.innerHTML = `
  <div class="placeholder-message">Select a category to view products</div>
`;

/* Load product data from JSON file */
async function loadProducts() {
  const response = await fetch("products.json");
  const data = await response.json();
  return data.products;
}

/* Save only product IDs so localStorage stays small and simple */
function saveSelections() {
  const ids = Array.from(selectedProductIds);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
}

/* Load saved IDs on page load */
function loadSavedSelections() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return;

  try {
    const parsed = JSON.parse(saved);
    if (Array.isArray(parsed)) {
      selectedProductIds = new Set(parsed);
    }
  } catch (error) {
    console.error("Could not read saved selections:", error);
  }
}

function updateActionButtonState() {
  const hasSelections = selectedProductIds.size > 0;
  generateRoutineBtn.disabled = !hasSelections;
  clearSelectionsBtn.disabled = !hasSelections;
}

/* Create HTML for displaying product cards */
function displayProducts(products) {
  if (products.length === 0) {
    productsContainer.innerHTML = `
      <div class="placeholder-message">No products found in this category yet.</div>
    `;
    return;
  }

  productsContainer.innerHTML = products
    .map((product) => {
      const isSelected = selectedProductIds.has(product.id);
      return `
        <article class="product-card ${isSelected ? "selected" : ""}" data-id="${product.id}">
          <div class="product-top">
            <img src="${product.image}" alt="${product.name}">
            <div class="product-info">
              <h3>${product.name}</h3>
              <p>${product.brand}</p>
              ${
                isSelected
                  ? '<span class="selected-label"><i class="fa-solid fa-check"></i> Selected</span>'
                  : ""
              }
            </div>
          </div>

          <details class="product-description">
            <summary>Show description</summary>
            <p>${product.description}</p>
          </details>
        </article>
      `;
    })
    .join("");
}

function getSelectedProducts() {
  return allProducts.filter((product) => selectedProductIds.has(product.id));
}

function renderSelectedProducts() {
  const selectedProducts = getSelectedProducts();

  if (selectedProducts.length === 0) {
    selectedProductsList.innerHTML = `
      <p class="placeholder-message">No products selected yet.</p>
    `;
    updateActionButtonState();
    return;
  }

  selectedProductsList.innerHTML = selectedProducts
    .map(
      (product) => `
      <div class="selected-product-pill">
        <span>${product.name}</span>
        <button
          type="button"
          class="remove-pill-btn"
          data-remove-id="${product.id}"
          aria-label="Remove ${product.name}"
        >
          x
        </button>
      </div>
    `,
    )
    .join("");

  updateActionButtonState();
}

function refreshProductGrid() {
  if (!currentCategory) {
    productsContainer.innerHTML = `
      <div class="placeholder-message">Select a category to view products</div>
    `;
    return;
  }

  const filteredProducts = allProducts.filter(
    (product) => product.category === currentCategory,
  );
  displayProducts(filteredProducts);
}

function addChatMessage(role, text) {
  const messageEl = document.createElement("div");
  messageEl.className = `chat-message ${role}`;
  messageEl.textContent = text;
  chatWindow.appendChild(messageEl);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function showLoadingMessage(text = "AI is thinking") {
  const loadingEl = document.createElement("div");
  loadingEl.className = "chat-message loading";
  loadingEl.setAttribute("aria-live", "polite");
  loadingEl.innerHTML = `
    <span>${text}</span>
    <span class="loading-dots" aria-hidden="true">
      <span></span>
      <span></span>
      <span></span>
    </span>
  `;
  chatWindow.appendChild(loadingEl);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return loadingEl;
}

function setChatLoading(isLoading) {
  sendBtn.disabled = isLoading;
  generateRoutineBtn.disabled = isLoading || selectedProductIds.size === 0;
}

/* Send messages to your Cloudflare Worker */
async function fetchAIResponse(messages) {
  const response = await fetch(WORKER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages,
    }),
  });

  if (!response.ok) {
    throw new Error("AI request failed. Please try again.");
  }

  const data = await response.json();

  /* Support a few common response shapes from worker backends */
  const content =
    data?.choices?.[0]?.message?.content ||
    data?.reply ||
    data?.message ||
    data?.output_text;

  if (!content) {
    throw new Error("AI response came back empty.");
  }

  return content;
}

async function generateRoutine() {
  const selectedProducts = getSelectedProducts();

  if (selectedProducts.length === 0) {
    addChatMessage("system", "Please select at least one product first.");
    return;
  }

  const simplifiedProducts = selectedProducts.map((product) => ({
    name: product.name,
    brand: product.brand,
    category: product.category,
    description: product.description,
  }));

  const systemPrompt = `You are a helpful L'Oreal routine advisor.
Use only the selected products provided by the user.
Build practical routines that are safe, clear, and beginner-friendly.
If asked unrelated topics, politely redirect to beauty routine questions.
Keep answers focused on skincare, haircare, makeup, fragrance, and grooming.`;

  const userPrompt = `Create a personalized routine with these selected products:\n${JSON.stringify(
    simplifiedProducts,
    null,
    2,
  )}\n\nInclude:\n- Morning routine\n- Evening routine\n- Why each product fits\n- A few safety/use tips`;

  conversationHistory = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  chatWindow.innerHTML = "";
  const loadingEl = showLoadingMessage("Generating your personalized routine");
  setChatLoading(true);

  try {
    const routineText = await fetchAIResponse(conversationHistory);

    chatWindow.innerHTML = "";
    addChatMessage("assistant", routineText);
    addChatMessage(
      "assistant",
      "You can now ask follow-up questions about this routine, product order, ingredients, or adjustments for your skin or hair goals.",
    );

    conversationHistory.push({ role: "assistant", content: routineText });
    conversationHistory.push({
      role: "assistant",
      content:
        "You can now ask follow-up questions about this routine, product order, ingredients, or adjustments for your skin or hair goals.",
    });
    routineWasGenerated = true;
  } catch (error) {
    addChatMessage("system", error.message);
  } finally {
    loadingEl.remove();
    setChatLoading(false);
  }
}

/* Filter and display products when category changes */
categoryFilter.addEventListener("change", (event) => {
  currentCategory = event.target.value;
  refreshProductGrid();
});

/* Click product cards to select or unselect */
productsContainer.addEventListener("click", (event) => {
  const clickedDescription = event.target.closest(".product-description");
  if (clickedDescription) {
    return;
  }

  const card = event.target.closest(".product-card");
  if (!card) return;

  const productId = Number(card.dataset.id);
  if (selectedProductIds.has(productId)) {
    selectedProductIds.delete(productId);
  } else {
    selectedProductIds.add(productId);
  }

  saveSelections();
  renderSelectedProducts();
  refreshProductGrid();
});

/* Remove a selected item directly from the Selected Products list */
selectedProductsList.addEventListener("click", (event) => {
  const removeButton = event.target.closest("[data-remove-id]");
  if (!removeButton) return;

  const productId = Number(removeButton.dataset.removeId);
  selectedProductIds.delete(productId);

  saveSelections();
  renderSelectedProducts();
  refreshProductGrid();
});

/* Clear all selections at once */
clearSelectionsBtn.addEventListener("click", () => {
  selectedProductIds.clear();
  saveSelections();
  renderSelectedProducts();
  refreshProductGrid();
});

generateRoutineBtn.addEventListener("click", generateRoutine);

/* Follow-up chat after routine generation */
chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const question = userInput.value.trim();
  if (!question) return;

  if (!routineWasGenerated) {
    addChatMessage(
      "system",
      "Generate a routine first, then ask follow-up questions about it.",
    );
    userInput.value = "";
    return;
  }

  addChatMessage("user", question);
  conversationHistory.push({ role: "user", content: question });
  userInput.value = "";
  const loadingEl = showLoadingMessage("Thinking about your follow-up");
  setChatLoading(true);

  try {
    const reply = await fetchAIResponse(conversationHistory);
    loadingEl.remove();
    addChatMessage("assistant", reply);
    conversationHistory.push({ role: "assistant", content: reply });
  } catch (error) {
    addChatMessage("system", error.message);
  } finally {
    loadingEl.remove();
    setChatLoading(false);
  }
});

async function init() {
  loadSavedSelections();
  allProducts = await loadProducts();

  /* Remove any saved IDs that no longer exist in products.json */
  const validIds = new Set(allProducts.map((product) => product.id));
  selectedProductIds = new Set(
    Array.from(selectedProductIds).filter((id) => validIds.has(id)),
  );

  renderSelectedProducts();
  saveSelections();
}

init();
