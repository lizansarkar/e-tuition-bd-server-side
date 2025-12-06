const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
// stripe requre key
// const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const port = process.env.PORT || 3000;

//middlewere
app.use(express.json());
app.use(cors());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@lizan0.tl45evy.mongodb.net/?appName=lizan0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    //create database in mongodb
    const db = client.db("e-tuition-bd-db");

    // Collections
    const usersCollection = db.collection("users");
    const teacherProfilesCollection = db.collection("teacherProfiles");
    const bookingsCollection = db.collection("bookings");
    // Optional
    const paymentsCollection = db.collection("payments");
    const reviewsCollection = db.collection("reviews");
    const coursesCollection = db.collection("courses");

    //tuition realeted api niche
    app.get("/users", async (req, res) => {});

    app.post("/users", async (req, res) => {
      const user = req.body;
      const result = await usersCollection.insertOne(user);
    });

    //riders realeted api ************
    app.patch("/riders/:id", async (req, res) => {
      const status = req.body.status;
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          status: status,
        },
      };

      const result = await riderCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    //add riders
    app.post("/riders", async (req, res) => {
      const rider = req.body;
      rider.status = "pending";
      rider.createdAt = new Date();

      const result = await riderCollection.insertOne(rider);
      res.send(result);
    });

    //get riders
    app.get("/riders", async (req, res) => {
      const query = {};
      if (req.query.status) {
        query.status = req.query.status;
      }
      const cursor = riderCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    //user realeted api ************
    app.get("/users", async (req, res) => {
      const cursor = userCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });
    app.get("/users/:id", async (req, res) => {});

    //create user role
    app.get("/users/:email/role", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = await userCollection.findOne(query);
      res.send({ user: user?.role || "user" });
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      user.role = "user";
      user.createdAt = new Date();

      const email = user.email;
      const userExists = await userCollection.findOne({ email });

      if (userExists) {
        return res.send({ message: "user exist" });
      }

      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    // accept user from admin
    app.patch("/users/:id/role", async (req, res) => {
      const id = req.params.id;
      const roleInfo = req.body;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: roleInfo.role,
        },
      };

      const result = await userCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    //parcel api here
    //get parcel data
    app.get("/parcels", async (req, res) => {
      const query = {};
      const { email } = req.query;

      if (email) {
        query.senderEmail = email;
      }

      const options = { sort: { createdAt: -1 } };

      const cursor = parcelsCollection.find(query, options);
      const result = await cursor.toArray();

      res.send(result);
    });

    //get payment paid or non paid data
    app.get("/parcels/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await parcelsCollection.findOne(query);

      res.send(result);
    });

    // add parcel data
    app.post("/parcels", async (req, res) => {
      const parcel = req.body;
      //for time dekhar ar jonne
      parcel.createdAt = new Date();
      const result = await parcelsCollection.insertOne(parcel);

      res.send(result);
    });

    //delte parcel data
    app.delete("/parcels/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await parcelsCollection.deleteOne(query);

      res.send(result);
    });

    //stripe payment raleted api
    app.post("/payment-checkout-session", async (req, res) => {
      const paymentInfo = req.body;
      console.log(paymentInfo);
      const amount = parseInt(paymentInfo.cost) * 100;
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: amount,
              product_data: {
                name: `Please pay for: ${paymentInfo.parcelName}`,
              },
            },
            quantity: 2,
          },
        ],
        mode: "payment",
        metadata: {
          parcelId: paymentInfo.parcelId,
        },
        customer_email: paymentInfo.senderEmail,
        success_url: `${process.env.STRIPE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.STRIPE_DOMAIN}/dashboard/payment-cancelled`,
      });

      res.send({ url: session.url });
    });

    app.post("/create-checkout-session", async (req, res) => {
      const paymentInfo = req.body;
      const amount = parseInt(paymentInfo.cost) * 100;

      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            // Provide the exact Price ID (for example, price_1234) of the product you want to sell
            price_data: {
              currency: "usd",
              unit_amount: amount,
              product_data: {
                name: paymentInfo.parcelName,
              },
            },
            quantity: 1,
          },
        ],
        customer_email: paymentInfo.senderEmail,
        mode: "payment",
        metadata: {
          parcelId: paymentInfo.parcelId,
        },
        success_url: `${process.env.STRIPE_DOMAIN}/dashboard/payment-success`,
        cancel_url: `${process.env.STRIPE_DOMAIN}/dashboard/payment-cancelled`,
      });

      console.log(session);
      res.send({url: session.url})
    });

    // Stripe payment related API
    app.post("/create-checkout-session", async (req, res) => {
      try {
        const paymentInfo = req.body;

        console.log("Received payment info:", paymentInfo);
        console.log("Cost value:", paymentInfo.cost);

        // Validate cost
        if (!paymentInfo.cost || isNaN(paymentInfo.cost)) {
          return res.status(400).send({
            error: "Invalid cost value",
            received: paymentInfo.cost,
          });
        }

        // Parse and convert to cents
        const amount = Math.round(parseFloat(paymentInfo.cost) * 100);

        console.log("Calculated amount in cents:", amount);

        // Validate amount
        if (amount <= 0 || isNaN(amount)) {
          return res.status(400).send({
            error: "Amount must be greater than 0",
            calculatedAmount: amount,
          });
        }

        const session = await stripe.checkout.sessions.create({
          line_items: [
            {
              price_data: {
                currency: "usd",
                unit_amount: amount,
                product_data: {
                  name: paymentInfo.parcelName || "Parcel Delivery",
                },
              },
              quantity: 1,
            },
          ],
          customer_email: paymentInfo.senderEmail,
          mode: "payment",
          metadata: {
            parcelId: paymentInfo.parcelId,
          },
          success_url: `${process.env.STRIPE_DOMAIN}/dashboard/payment-success`,
          cancel_url: `${process.env.STRIPE_DOMAIN}/dashboard/payment-cancelled`,
        });

        console.log("Session created:", session.id);
        res.send({ url: session.url });
      } catch (error) {
        console.error("Stripe error:", error);
        res.status(500).send({
          error: error.message,
          details: error.raw?.message,
        });
      }
    });

    //update payment details
    app.patch("/payment-success", async (req, res) => {
      const sessionId = req.query.session_id;

      const session = await stripe.checkout.sessions.retrieve(sessionId);
      console.log("session retripe", session);
      if ((session.payment_status = "paid")) {
        const id = session.metadata.parcelId;
        const query = { _id: new ObjectId(id) };
        const update = {
          $set: {
            paymentStatus: "paid",
          },
        };

        const result = await parcelsCollection.updateOne(query, update);
        res.send(result);
      }

      res.send({ success: false });
    });


    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("e tuition aplication server is running???????");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
