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
    const tuitionPostsCollection = db.collection("tuitionPosts");
    const applicationsCollection = db.collection("applications");

    //tuition realeted api niche
    app.get("/users", async (req, res) => {});

    app.post("/users", async (req, res) => {
      const user = req.body;
      const result = await usersCollection.insertOne(user);
    });

    //post new tuition post data
    app.post("/post-new-tuition", async (req, res) => {
      try {
        const tuitionPost = req.body;

        // 1. Data Validation (Optional but Recommended)
        if (
          !tuitionPost.subject ||
          !tuitionPost.location ||
          !tuitionPost.budget
        ) {
          return res.status(400).send({ message: "Missing required fields" });
        }

        // 2. Add necessary server-side fields
        tuitionPost.createdAt = new Date();
        tuitionPost.status = "Pending"; // Initial status for admin review

        // 3. Save to MongoDB
        const result = await tuitionPostsCollection.insertOne(tuitionPost);

        // 4. Send success response with inserted ID
        res.status(201).send({
          insertedId: result.insertedId,
          message: "Tuition post created successfully and is pending approval.",
        });
      } catch (error) {
        console.error("Error creating tuition post:", error);
        res.status(500).send({
          message: "Failed to create tuition post.",
          error: error.message,
        });
      }
    });

    //get tuition post data
    app.get("/tuition-posts", async (req, res) => {
      try {
        const { email } = req.query;
        const query = {};

        if (email) {
          query.userEmail = email;
        }

        const options = { sort: { createdAt: -1 } };

        const cursor = tuitionPostsCollection.find(query, options);
        const result = await cursor.toArray();

        res.send(result);
      } catch (error) {
        console.error("Error fetching tuition posts:", error);
        res.status(500).send({ message: "Failed to fetch tuition posts." });
      }
    });

    // update tuition post data
    app.put("/post-new-tuition/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const updatedData = req.body;
        const query = { _id: new ObjectId(id) };

        const updateDoc = {
          $set: {
            ...updatedData, // Set all fields from req.body
            updatedAt: new Date(), // Optional: add update time
            status: "Pending", // Re-submit for approval after edit
          },
        };
        const result = await tuitionPostsCollection.updateOne(query, updateDoc);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to update post." });
      }
    });

    // Delete tuition post data
    app.delete("/post-new-tuition/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await tuitionPostsCollection.deleteOne(query);
        res.send(result); // result will contain deletedCount
      } catch (error) {
        res.status(500).send({ message: "Failed to delete post." });
      }
    });

    //tutor dashboard api
    app.post("/applications", async (req, res) => {
      try {
        const applicationData = req.body; // Mandatory data check (should come from frontend modal)

        if (
          !applicationData.tuitionId ||
          !applicationData.tutorEmail ||
          !applicationData.expectedSalary
        ) {
          return res
            .status(400)
            .send({ message: "Missing required application fields." });
        } // Check if the tutor has already applied to this post

        const existingApplication = await applicationsCollection.findOne({
          tuitionId: applicationData.tuitionId,
          tutorEmail: applicationData.tutorEmail,
        });

        if (existingApplication) {
          return res.status(409).send({
            message: "You have already applied to this tuition post.",
          });
        } // Set initial status and date

        const newApplication = {
          ...applicationData,
          tuitionId: new ObjectId(applicationData.tuitionId), // Convert to ObjectId
          status: "Pending",
          appliedDate: new Date(),
        };

        const result = await applicationsCollection.insertOne(newApplication); // OPTIONAL: Increment the appliedTutors count in the tuitionPost

        await tuitionPostsCollection.updateOne(
          { _id: new ObjectId(applicationData.tuitionId) },
          { $inc: { appliedTutorsCount: 1 } } // Assuming you have 'appliedTutorsCount' field
        );

        res.status(201).send(result);
      } catch (error) {
        console.error("Error creating application:", error);
        res.status(500).send({ message: "Failed to submit application." });
      }
    });

    //get tutor data with email diye
    app.get("/applications/tutor/:email", async (req, res) => {
      try {
        const tutorEmail = req.params.email;
        const query = { tutorEmail: tutorEmail };

        const applications = await applicationsCollection
          .find(query)
          .sort({ appliedDate: -1 })
          .toArray(); // Optional: Join with tuitionPostsCollection to get tuition details

        const applicationDetails = await Promise.all(
          applications.map(async (app) => {
            const tuitionPost = await tuitionPostsCollection.findOne({
              _id: new ObjectId(app.tuitionId),
            }); // Return the application object with embedded tuition post details
            return { ...app, tuitionDetails: tuitionPost || null };
          })
        );

        res.send(applicationDetails);
      } catch (error) {
        console.error("Error fetching tutor applications:", error);
        res.status(500).send({ message: "Failed to fetch applications." });
      }
    });

    //uptate tutor data akhan theke
    app.patch("/applications/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const updatedData = req.body;
        const query = { _id: new ObjectId(id), status: "Pending" }; // Only update if Pending

        const updateDoc = {
          $set: {
            // ... apnar existing logic ...
            qualifications: updatedData.qualifications,
            experience: updatedData.experience,
            expectedSalary: updatedData.expectedSalary,
            updatedAt: new Date(),
          },
        };

        const result = await applicationsCollection.updateOne(query, updateDoc);
        res.send(result);
      } catch (error) {
        console.error("Error updating application:", error);
        res.status(500).send({ message: "Failed to update application." });
      }
    });

    //delte tutor data akhan theke
    app.delete("/applications/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id), status: "Pending" }; // Only delete if Pending // First, find the application to get tuitionId before deleting

        const applicationToDelete = await applicationsCollection.findOne(query);

        if (!applicationToDelete) {
          return res.status(404).send({
            message:
              "Application not found or status is not Pending (cannot be deleted).",
          });
        }

        const result = await applicationsCollection.deleteOne(query);

        if (result.deletedCount > 0) {
          // OPTIONAL: Decrement the appliedTutors count in the tuitionPost
          await tuitionPostsCollection.updateOne(
            { _id: applicationToDelete.tuitionId },
            { $inc: { appliedTutorsCount: -1 } }
          );
        }

        res.send(result);
      } catch (error) {
        console.error("Error deleting application:", error);
        res.status(500).send({ message: "Failed to delete application." });
      }
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
