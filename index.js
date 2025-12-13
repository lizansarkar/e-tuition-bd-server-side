const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
// stripe require key
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

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

    //admin verify middleware
    // const verifyAdmin = async (req, res, next) => {
    //   try {
    //     const email = req.decoded_email;
    //     const query = { email };
    //     const user = await usersCollection.findOne(query);

    //     if (!user || user.role !== "admin") {
    //       return res.status(403).send({ message: "forbidden access" });
    //     }

    //     next();
    //   } catch (error) {
    //     res.status(500).send({ message: "Internal server error" });
    //   }
    // };

    // login kora Frontend theke pawa data database set kora hocce
    app.post("/users", async (req, res) => {
      // Frontend theke pawa data
      const user = req.body;
      const email = user.email;

      if (!email) {
        return res
          .status(400)
          .send({ message: "Email is missing in request body" });
      }

      try {
        // Check if the user already exists in the database
        const userExists = await usersCollection.findOne({ email: email });

        if (userExists) {
          // User already thakle, notun kore save na kore shudhu status 200 diye message pathano
          return res.send({
            message: "user exists in database",
            user: userExists,
            isNewUser: false,
          });
        }

        // New user data object
        const newUser = {
          email: email,
          displayName: user.name || user.displayName, // Register form theke 'name' ba Google theke 'displayName' nawa holo
          photoURL: user.photoURL || null,
          phone: user.phone || null,
          firebaseUID: user.firebaseUID, // Firebase UID save kora holo
          role: user.role, // Student ba Tutor role save kora holo
          createdAt: new Date(),
        };

        // Save new user to MongoDB
        const result = await usersCollection.insertOne(newUser);

        // Success response
        res.status(201).send({
          insertedId: result.insertedId,
          message: "New user created successfully in database",
          user: newUser,
          isNewUser: true,
        });
      } catch (error) {
        console.error("Database save error:", error);
        res.status(500).send({
          message: "Failed to save user in database",
          error: error.message,
        });
      }
    });

    // email diye role chek kora hocce
    app.get("/users/:email/role", async (req, res) => {
      try {
        const email = req.params.email;

        const userCollection = client.db("e-tuition-bd-db").collection("users");

        const user = await userCollection.findOne(
          { email: email },
          { projection: { role: 1, _id: 0 } }
        );

        if (!user) {
          return res.status(404).send({ role: "Guest" });
        }

        // Shothik user role return kora holo
        res.send({ role: user.role });
      } catch (error) {
        console.error("Error fetching user role:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    //*****************  Admin realeted api  ******************
    // 1. GET: Fetch ALL Users for Admin Management
    app.get("/admin/users", async (req, res) => {
      try {
        // Optional: Add verifyAdmin middleware here
        const users = await usersCollection.find().toArray();
        res.send(users);
      } catch (error) {
        console.error("Error fetching all users:", error);
        res.status(500).send({ message: "Failed to fetch users." });
      }
    });

    // Route 1: Get all Pending Tuition Posts for Admin Review
    app.get("/aprove-posts", async (req, res) => {
      // Optional: Admin authorization check add kora uchit.
      // Ekhane shudhu 'Pending' status diye filter kora holo.
      const query = { status: "Pending" };
      try {
        const pendingPosts = await tuitionPostsCollection.find(query).toArray();
        res.send(pendingPosts);
      } catch (error) {
        console.error("Error fetching pending posts:", error);
        res.status(500).send({
          message: "Failed to fetch pending posts",
          error: error.message,
        });
      }
    });

    app.patch("/aprove-posts/:id", async (req, res) => {
      // Optional: Admin authorization check add kora uchit.

      const postId = req.params.id;

      try {
        // Validate and convert ID
        const idQuery = { _id: new ObjectId(postId) };

        // Update document
        const updateDoc = {
          $set: {
            status: "Approved", // Status update kora holo
            approvedAt: new Date(), // Kono somoy approve holo, sheta record kora holo
          },
        };

        const result = await tuitionPostsCollection.updateOne(
          idQuery,
          updateDoc
        );

        if (result.matchedCount === 0) {
          return res
            .status(404)
            .send({ message: "Post not found or already approved." });
        }

        res.send({
          message: "Tuition post approved successfully!",
          modifiedCount: result.modifiedCount,
        });
      } catch (error) {
        console.error("Error approving post:", error);
        // Invalid ObjectId holeo ekhane dhora porbe
        res
          .status(500)
          .send({ message: "Failed to approve post", error: error.message });
      }
    });

    // 2. PATCH: Update User Role (e.g., Student to Tutor, or Tutor to Admin)
    app.patch("/admin/users/:id/role", async (req, res) => {
      try {
        // Optional: Add verifyAdmin middleware here
        const id = req.params.id;
        const { role } = req.body; // New role (e.g., 'tutor', 'student', 'admin')

        if (!role) {
          return res.status(400).send({ message: "Role is required." });
        }

        const query = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            role: role,
          },
        };

        const result = await usersCollection.updateOne(query, updateDoc);
        res.send(result);
      } catch (error) {
        console.error("Error updating user role:", error);
        res.status(500).send({ message: "Failed to update user role." });
      }
    });

    // 3. DELETE: Delete User Account
    app.delete("/admin/users/:id", async (req, res) => {
      try {
        // Optional: Add verifyAdmin middleware here
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };

        const result = await usersCollection.deleteOne(query);

        if (result.deletedCount === 0) {
          return res.status(404).send({ message: "User not found." });
        }
        res.send(result);
      } catch (error) {
        console.error("Error deleting user:", error);
        res.status(500).send({ message: "Failed to delete user." });
      }
    });

    //
    // 4. GET: Fetch ALL Pending Tuition Posts for Admin Review
    app.get("/admin/tuition-posts/pending", async (req, res) => {
      try {
        // Optional: Add verifyAdmin middleware here
        const query = { status: "Pending" };
        const posts = await tuitionPostsCollection
          .find(query)
          .sort({ createdAt: 1 })
          .toArray(); // Oldest first
        res.send(posts);
      } catch (error) {
        console.error("Error fetching pending tuition posts:", error);
        res.status(500).send({ message: "Failed to fetch pending posts." });
      }
    });

    // 5. PATCH: Approve or Reject a Tuition Post
    app.patch("/admin/tuition-posts/:id/status", async (req, res) => {
      try {
        // Optional: Add verifyAdmin middleware here
        const id = req.params.id;
        const { newStatus } = req.body; // Should be 'Approved' or 'Rejected'

        if (newStatus !== "Approved" && newStatus !== "Rejected") {
          return res.status(400).send({ message: "Invalid status provided." });
        }

        const query = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            status: newStatus,
            reviewedAt: new Date(),
          },
        };

        const result = await tuitionPostsCollection.updateOne(query, updateDoc);

        if (result.matchedCount === 0) {
          return res.status(404).send({ message: "Tuition post not found." });
        }
        res.send(result);
      } catch (error) {
        console.error("Error updating tuition post status:", error);
        res.status(500).send({ message: "Failed to update status." });
      }
    });

    // 6. GET: Reports & Analytics (Total Earnings and Transactions)
    app.get("/admin/reports/earnings", async (req, res) => {
      try {
        // Optional: Add verifyAdmin middleware here
        // 1. Total Earnings Calculation
        // Assuming 'paymentsCollection' stores successful payments with an 'amount' field
        const totalEarningsResult = await paymentsCollection
          .aggregate([
            {
              $group: {
                _id: null,
                totalAmount: { $sum: "$amount" }, // Replace "amount" with your actual payment field name
              },
            },
          ])
          .toArray();

        const totalEarnings =
          totalEarningsResult.length > 0
            ? totalEarningsResult[0].totalAmount
            : 0; // 2. Transaction History

        const transactions = await paymentsCollection
          .find()
          .sort({ paymentDate: -1 })
          .toArray();

        res.send({
          totalEarnings: totalEarnings,
          transactionHistory: transactions,
        });
      } catch (error) {
        console.error("Error fetching financial reports:", error);
        res.status(500).send({ message: "Failed to fetch reports." });
      }
    });

    // ************** student related api niche *****************
    //aijayga theke all aproved tuition data niye all tuitions page a dekhano hocce
    app.get("/all-approved-tuitions", async (req, res) => {
      try {
        // Query to fetch only posts approved by Admin
        const query = { status: "Approved" };

        const options = {
          sort: { createdAt: -1 },
        };

        const cursor = tuitionPostsCollection.find(query, options);
        const result = await cursor.toArray();

        res.send(result);
      } catch (error) {
        console.error("Error fetching all approved tuition posts:", error);
        res
          .status(500)
          .send({ message: "Failed to fetch approved tuition posts." });
      }
    });

    //aijayga theke single tuition post details anbo
    app.get("/all-tuition/:id", async (req, res) => {
      const postId = req.params.id;
      try {
        const query = { _id: new ObjectId(postId), status: "Approved" };
        const tuitionPost = await tuitionPostsCollection.findOne(query);

        if (!tuitionPost) {
          return res
            .status(404)
            .send({ message: "Tuition post not found or not approved." });
        }
        res.send(tuitionPost);
      } catch (error) {
        console.error("Error fetching tuition post:", error);
        res.status(500).send({ message: "Failed to fetch post details" });
      }
    });

    // applicationsCollection theke akta data ane tutor aplied korbe mane tutor aplication korbe akhan theke
    app.post("/applications", async (req, res) => {
      const application = req.body;
      const { tuitionId, tutorEmail } = application;

      if (!tuitionId || !tutorEmail) {
        return res.status(400).send({
          message: "Missing required fields: tuitionId or tutorEmail",
        });
      }

      try {
        // 1. Check if the tutor has already applied to this post
        const existingApplication = await applicationsCollection.findOne({
          tuitionId: tuitionId,
          tutorEmail: tutorEmail,
        });

        if (existingApplication) {
          // Already applied error
          return res.status(409).send({
            message: "You have already applied for this tuition post.",
          });
        }

        // 2. Prepare and save the application data
        const newApplication = {
          ...application,
          // Ensure ID is ObjectId if needed later, but here we keep it as string from frontend
          tuitionId: tuitionId,
          tuitionObjectId: new ObjectId(tuitionId), // ObjectId of the original post for indexing/lookup
          status: "Pending", // Status is always Pending on submission
          appliedAt: new Date(),
        };

        const result = await applicationsCollection.insertOne(newApplication);

        res.status(201).send({
          message: "Application successfully submitted!",
          insertedId: result.insertedId,
        });
      } catch (error) {
        console.error("Error submitting application:", error);
        res.status(500).send({
          message: "Failed to submit application",
          error: error.message,
        });
      }
    });

    //post new tuition aijaygay net tuition post kora hobe
    app.post("/post-new-tuition", async (req, res) => {
      try {
        const tuitionPost = req.body;

        if (
          !tuitionPost.subject ||
          !tuitionPost.location ||
          !tuitionPost.budget
        ) {
          return res.status(400).send({ message: "Missing required fields" });
        }

        // server-side fields
        tuitionPost.createdAt = new Date();
        tuitionPost.status = "Pending";

        const result = await tuitionPostsCollection.insertOne(tuitionPost);

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

    // get tuition post data
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

    //************** tutor realeted api *****************
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

    app.get("/applications/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const application = await applicationsCollection.findOne(query);
        if (!application) {
          return res

            .status(404)
            .send({ message: "Application not found with the provided ID." });
        }
        res.send(application);
      } catch (error) {
        console.error("Error fetching application:", error);
        res.status(500).send({ message: "Failed to fetch application." });
      }
    });

    // get tutor data with email diye
    app.get("/tutor/applications/:email", async (req, res) => {
      try {
        const tutorEmail = req.params.email;
        const query = { tutorEmail: tutorEmail };

        const applications = await applicationsCollection
          .find(query)
          .sort({ appliedDate: -1 })
          .toArray();

        const applicationDetails = await Promise.all(
          applications.map(async (app) => {
            const tuitionPost = await tuitionPostsCollection.findOne({
              _id: new ObjectId(app.tuitionId),
            });
            return { ...app, tuitionDetails: tuitionPost || null };
          })
        );

        res.send(applicationDetails);
      } catch (error) {
        console.error("Error fetching tutor applications:", error);
        res.status(500).send({ message: "Failed to fetch applications." });
      }
    });

    //all pending tutor data dekhabo student ar route
    app.get("/applications", async (req, res) => {
      try {
        // Warning: Eita database theke shob applications fetch korche,
        // kono student filter check kora hocche na.
        const allApplications = await applicationsCollection
          .find({}) // Kono query nei, tai shob data fetch hobe
          .sort({ appliedAt: -1 })
          .toArray();

        // Final response
        res.send(allApplications);
      } catch (error) {
        console.error("Error fetching all applications:", error);
        res.status(500).send({ message: "Failed to fetch all applications." });
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
    

    app.get("/tutor/:id", async (req, res) => {
      const id = req.params.id;
      try {
        const query = { _id: new ObjectId(id) };
        const result = await applicationsCollection.findOne(query);
        if (!result) {
          return res.status(404).send({ message: "Tutor profile not found." });
        }
        res.send(result);
      }
      catch (error) {
        console.error("Error fetching tutor profile:", error);
        res.status(500).send({ message: "Failed to fetch tutor profile." });
      }
    });

    //payment realeted api
    app.post("/create-checkout-session", async (req, res) => {
      const paymentInfo = req.body;
      const amount = paymentInfo.expectedSalary;
      const session = await stripe.checkout.sessions.create({
        // payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: "E Tuition Payment",
              },
              unit_amount: amount * 100,
              // unit_amount: amount,
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        metadata: {
          tutorEmail: paymentInfo.tutorEmail,
          studentEmail: paymentInfo.studentEmail,
          tuitionId: paymentInfo.tuitionId,
        },
        
        customer_email: paymentInfo.tutorEmail,
        success_url: `${process.env.STRIPE_DOMAIN}/dashboard/student/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.STRIPE_DOMAIN}/dashboard/student/payment-cancelled`,
      });
      console.log(session);
      res.send({ url: session.url });
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
