import express from "express";
import cors from "cors";
import Stripe from "stripe";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const stripe = new Stripe(
  process.env.STRIPE_ENV === "production"
    ? process.env.STRIPE_SECRET_KEY
    : process.env.STRIPE_TEST_SECRET_KEY,
  { apiVersion: "2020-03-02" }
);

function logInfo(message) {
  console.log("\n" + message + "\n");
  return message;
}

function validateApiKey() {
  if (!stripe || !stripe.StripeResource.STRIPE_SECRET_KEY)
    return "Error: you provided an empty secret key. Please provide your test mode secret key.";
  const key = stripe.StripeResource.STRIPE_SECRET_KEY;
  if (key.startsWith("pk_"))
    return "Error: you used a publishable key. Use your test secret key.";
  if (key.startsWith("sk_live"))
    return "Error: you used a live mode secret key. Use your test mode secret key.";
  return null;
}

app.get("/", (req, res) => {
  res.status(200).sendFile(path.join(__dirname, "index.html"));
});


app.get("/test", (req, res) => {
  res.status(200).json({data: "hello worlds"});
});


app.post("/register_reader", async (req, res) => {
  // const validationError = validateApiKey();
  // if (validationError) return res.status(400).send(logInfo(validationError));
  try {
    const reader = await stripe.terminal.readers.create({
      registration_code: req.body.registration_code,
      label: req.body.label,
      location: req.body.location,
    });
    logInfo(`Reader registered: ${reader.id}`);
    res.status(200).json(reader);
  } catch (err) {
    res.status(402).send(logInfo(`Error registering reader! ${err.message}`));
  }
});

app.post("/connection_token", async (req, res) => {
  // const validationError = validateApiKey();
  // if (validationError) return res.status(400).send(logInfo(validationError));
  try {
    const token = await stripe.terminal.connectionTokens.create();
    res.status(200).json({ secret: token.secret });
  } catch (err) {
    res.status(402).send(logInfo(`Error creating ConnectionToken! ${err.message}`));
  }
});

app.post("/create_payment_intent", async (req, res) => {
  // const validationError = validateApiKey();
  // if (validationError) return res.status(400).send(logInfo(validationError));
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      payment_method_types: req.body.payment_method_types || ["card_present"],
      capture_method: req.body.capture_method || "manual",
      amount: req.body.amount,
      currency: req.body.currency || "gbp",
      description: req.body.description || "Example PaymentIntent",
      payment_method_options: req.body.payment_method_options || {},
      receipt_email: req.body.receipt_email,
    });
    logInfo(`PaymentIntent created: ${paymentIntent.id}`);
    res.status(200).json({
      intent: paymentIntent.id,
      secret: paymentIntent.client_secret,
    });
  } catch (err) {
    res.status(402).send(logInfo(`Error creating PaymentIntent! ${err.message}`));
  }
});

app.post("/capture_payment_intent", async (req, res) => {
  try {
    const { payment_intent_id, amount_to_capture } = req.body;
    const paymentIntent = await stripe.paymentIntents.capture(payment_intent_id, {
      amount_to_capture,
    });
    logInfo(`PaymentIntent captured: ${payment_intent_id}`);
    res.status(200).json({
      intent: paymentIntent.id,
      secret: paymentIntent.client_secret,
    });
  } catch (err) {
    res.status(402).send(logInfo(`Error capturing PaymentIntent! ${err.message}`));
  }
});

app.post("/cancel_payment_intent", async (req, res) => {
  try {
    const { payment_intent_id } = req.body;
    const paymentIntent = await stripe.paymentIntents.cancel(payment_intent_id);
    logInfo(`PaymentIntent canceled: ${payment_intent_id}`);
    res.status(200).json({
      intent: paymentIntent.id,
      secret: paymentIntent.client_secret,
    });
  } catch (err) {
    res.status(402).send(logInfo(`Error canceling PaymentIntent! ${err.message}`));
  }
});

app.post("/create_setup_intent", async (req, res) => {
  // const validationError = validateApiKey();
  // if (validationError) return res.status(400).send(logInfo(validationError));
  try {
    const params = {
      payment_method_types: req.body.payment_method_types || ["card_present"],
      customer: req.body.customer,
      description: req.body.description,
      on_behalf_of: req.body.on_behalf_of,
    };
    const setupIntent = await stripe.setupIntents.create(params);
    logInfo(`SetupIntent created: ${setupIntent.id}`);
    res.status(200).json({
      intent: setupIntent.id,
      secret: setupIntent.client_secret,
    });
  } catch (err) {
    res.status(402).send(logInfo(`Error creating SetupIntent! ${err.message}`));
  }
});

async function lookupOrCreateExampleCustomer() {
  const email = "example@test.com";
  const customers = await stripe.customers.list({ email, limit: 1 });
  return customers.data.length ? customers.data[0] : await stripe.customers.create({ email });
}

app.post("/attach_payment_method_to_customer", async (req, res) => {
  try {
    const customer = await lookupOrCreateExampleCustomer();
    const paymentMethod = await stripe.paymentMethods.attach(req.body.payment_method_id, {
      customer: customer.id,
      expand: ["customer"],
    });
    logInfo(`Attached PaymentMethod to Customer: ${customer.id}`);
    res.status(200).json(paymentMethod);
  } catch (err) {
    res.status(402).send(logInfo(`Error attaching PaymentMethod! ${err.message}`));
  }
});

app.post("/update_payment_intent", async (req, res) => {
  const { payment_intent_id, receipt_email } = req.body;
  if (!payment_intent_id)
    return res.status(400).send(logInfo("'payment_intent_id' is required"));
  try {
    const paymentIntent = await stripe.paymentIntents.update(payment_intent_id, {
      receipt_email,
    });
    logInfo(`Updated PaymentIntent ${payment_intent_id}`);
    res.status(200).json({
      intent: paymentIntent.id,
      secret: paymentIntent.client_secret,
    });
  } catch (err) {
    res.status(402).send(logInfo(`Error updating PaymentIntent! ${err.message}`));
  }
});

app.get("/list_locations", async (req, res) => {
  // const validationError = validateApiKey();
  // if (validationError) return res.status(400).send(logInfo(validationError));
  try {
    const locations = await stripe.terminal.locations.list({ limit: 100 });
    logInfo(`${locations.data.length} Locations fetched`);
    res.status(200).json(locations.data);
  } catch (err) {
    res.status(402).send(logInfo(`Error fetching Locations! ${err.message}`));
  }
});

app.post("/create_location", async (req, res) => {
  // const validationError = validateApiKey();
  // if (validationError) return res.status(400).send(logInfo(validationError));
  try {
    const location = await stripe.terminal.locations.create({
      display_name: req.body.display_name,
      address: req.body.address,
    });
    logInfo(`Location created: ${location.id}`);
    res.status(200).json(location);
  } catch (err) {
    res.status(402).send(logInfo(`Error creating Location! ${err.message}`));
  }
});

const PORT = process.env.PORT || 4242;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
