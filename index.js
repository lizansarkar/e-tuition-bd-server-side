const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
// stripe require key
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const port = process.env.PORT || 3000;
const crypto = require("crypto");

const admin = require("firebase-admin");

const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf8')
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

/**
 * Generate a unique tracking ID format: ETBD-YYYYMMDD-RANDOMLIKEID
 */
function generateTrackingId() {
  const prefix = "ETBD";
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  // Unique ID: 8 characters long random hex
  const random = crypto.randomBytes(4).toString("hex").toUpperCase();

  return `${prefix}-${date}-${random}`;
}

//middlewere
app.use(express.json());
app.use(cors());

const verifyFBToken = async (req, res, next) => {
  const token = req.headers?.authorization;
  console.log("token from header", token);

  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }

  try {
    const idToken = token.split(" ")[1];
    const decoded = await admin.auth().verifyIdToken(idToken);
    console.log("decoded in the token", decoded);
    req.decoded_email = decoded.email;
    next();
  } catch (err) {
    return res.status(401).send({ message: "unauthorized access" });
  }
};

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
    const paymentsCollection = db.collection("payments");
    const tuitionPostsCollection = db.collection("tuitionPosts");
    const applicationsCollection = db.collection("applications");

    // const teacherProfilesCollection = db.collection("teacherProfiles");
    // const bookingsCollection = db.collection("bookings");
    // const reviewsCollection = db.collection("reviews");
    // const coursesCollection = db.collection("courses");

    //aita firebase token use korar por babohar kora uchit
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded_email;
      const query = { email };
      const user = await usersCollection.findOne(query);

      if (!user || user.role !== "admin") {
        return res.status(403).send({ message: "forbidden access" });
      }

      next();
    };

    const verifyTutor = async (req, res, next) => {
      const email = req.decoded_email;
      const query = { email };
      const user = await usersCollection.findOne(query);

      if (!user || user.role !== "tutor") {
        return res.status(403).send({ message: "forbidden access" });
      }

      next();
    };

    const verifyStudent = async (req, res, next) => {
      const email = req.decoded_email;
      const query = { email };
      const user = await usersCollection.findOne(query);

      if (!user || user.role !== "student") {
        return res.status(403).send({ message: "forbidden access" });
      }

      next();
    };

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
          firebaseUID: user.firebaseUID,
          role: user.role,
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

    // app.get("/users/:id", async (req, res) => {
    //   const id = req.params.id;
    //   const user = await usersCollection.findOne({ _id: new ObjectId(id) });
    //   res.send(user);
    // });

    app.get("/users/:email/role", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      console.log(query);
      const user = await usersCollection.findOne(query);
      res.send({ role: user?.role || "user" });
    });

    // 1. Fetch User Profile API (GET)
    app.get("/user-profile", async (req, res) => {
      try {
        const email = req.query.email;
        if (!email) {
          return res.status(400).send({ message: "User email is required." });
        }
        const user = await usersCollection.findOne({ email: email });
        if (!user) {
          return res.status(404).send({ message: "User not found." });
        }
        res.send(user);
      } catch (error) {
        console.error("Error fetching user profile:", error);
        res.status(500).send({ message: "Failed to fetch user profile." });
      }
    });

    // 2. Update User Profile API (PATCH)
    app.patch("/user-profile/:email", verifyFBToken, async (req, res) => {
      try {
        const email = req.params.email;
        const updatedData = req.body;

        const updateDoc = {
          $set: {
            displayName: updatedData.displayName,
            phone: updatedData.phone,
            photoURL: updatedData.photoURL,
          },
        };

        const result = await usersCollection.updateOne(
          { email: email },
          updateDoc
        );

        if (result.modifiedCount === 0) {
          return res
            .status(200)
            .send({ message: "No changes detected or user not found." });
        }

        res.send({
          acknowledged: true,
          modifiedCount: result.modifiedCount,
          message: "Profile successfully updated.",
        });
      } catch (error) {
        console.error("Error updating user profile:", error);
        res.status(500).send({ message: "Failed to update profile." });
      }
    });

    //*****************  Admin realeted api  ******************
    //get all user for user management
    app.get("/users/all", verifyFBToken, verifyAdmin, async (req, res) => {
      try {
        const users = await usersCollection.find().toArray();

        res.send(users);
      } catch (error) {
        console.error("Error fetching all users:", error);
        res
          .status(500)
          .send({ message: "Failed to fetch user list from server." });
      }
    });

    // Purpose: Admin panel-er jonne shob tuition post-der data anar jonne
    app.get("/tuitions/all", verifyFBToken, verifyAdmin, async (req, res) => {
      try {
        // Shob tuition posts kora holo (jodi shudhu pending chaan, tahole find({status: "Pending"}) hobe)
        const posts = await tuitionPostsCollection
          .find()
          .sort({ appliedAt: -1 })
          .toArray();

        res.send(posts);
      } catch (error) {
        console.error("Error fetching all tuitions:", error);
        res
          .status(500)
          .send({ message: "Failed to fetch tuition list from server." });
      }
    });

    // Purpose: Admin panel-er jonne platform-er total earnings and all transactions anar jonne
    app.get("/admin-total-earnings", async (req, res) => {
      try {
        // --- Pagination Parameters ---
        // Default page 0, Default limit 10
        const page = parseInt(req.query.page) || 0;
        const limit = parseInt(req.query.limit) || 10;
        const skip = page * limit;

        const query = {};

        // 1. Total Count (Pagination er jonne dorkar)
        const totalCount = await paymentsCollection.countDocuments(query);

        // 2. Paginated Payment History Fetch kora
        const allPayments = await paymentsCollection
          .find(query)
          .sort({ paymentDate: -1 })
          .skip(skip) // ⭐ Shuru kothay theke hobe
          .limit(limit) // ⭐ Koyta data dekhabe
          .toArray();

        const totalEarningsArray = await paymentsCollection
          .find({}, { projection: { amount: 1, _id: 0 } })
          .toArray();
        const totalEarnings = totalEarningsArray.reduce(
          (sum, payment) => sum + (payment.amount || 0),
          0
        );

        res.send({
          totalEarnings: totalEarnings,
          allTransactions: allPayments,
          totalCount: totalCount, // ⭐ Total item count pathano holo
          totalPages: Math.ceil(totalCount / limit),
        });
      } catch (error) {
        console.error("Error fetching admin total earnings:", error);
        res
          .status(500)
          .send({ message: "Failed to fetch platform earnings data." });
      }
    });

    // Purpose: Tuition post-er status change kora
    app.patch("/tuitions/status/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const { status } = req.body; // Status ("Approved" ba "Rejected") frontend theke asbe

        if (!status || (status !== "Approved" && status !== "Rejected")) {
          return res.status(400).send({ message: "Invalid status provided." });
        }

        const query = { _id: new ObjectId(id) };

        const updateDoc = {
          $set: {
            status: status,
            updatedAt: new Date(),
          },
        };

        const result = await tuitionPostsCollection.updateOne(query, updateDoc);

        if (result.modifiedCount === 0) {
          return res
            .status(404)
            .send({ message: "Tuition Post not found or status unchanged." });
        }

        res.send({
          acknowledged: true,
          modifiedCount: result.modifiedCount,
          message: `Tuition status updated to ${status}.`,
        });
      } catch (error) {
        console.error("Error updating tuition status:", error);
        res.status(500).send({ message: "Failed to update tuition status." });
      }
    });

    // Purpose: User information (name, phone, role) update kora
    app.patch("/users/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const updatedData = req.body; // Client theke asha updated data

        const query = { _id: new ObjectId(id) };

        // Jekono field update kora jay, jeta updatedData-te thakbe.
        // MongoDB-te $set use kore shudhu oi field gulo update kora hoy jeta body-te pathano hoyechhe.
        const updateDoc = {
          $set: updatedData,
        };

        const result = await usersCollection.updateOne(query, updateDoc);

        if (result.modifiedCount === 0) {
          return res
            .status(404)
            .send({ message: "User not found or data unchanged." });
        }

        res.send({
          acknowledged: true,
          modifiedCount: result.modifiedCount,
          message: "User information successfully updated.",
        });
      } catch (error) {
        console.error("Error updating user:", error);
        res.status(500).send({ message: "Failed to update user information." });
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
    app.patch(
      "/admin/users/:id/role",
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
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
      }
    );

    // Purpose: User account delete kora
    app.delete("/users/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };

        const result = await usersCollection.deleteOne(query);

        if (result.deletedCount === 0) {
          return res
            .status(404)
            .send({ message: "User not found or already deleted." });
        }

        res.send({
          acknowledged: true,
          deletedCount: result.deletedCount,
          message: "User account successfully deleted.",
        });
      } catch (error) {
        console.error("Error deleting user:", error);
        res.status(500).send({ message: "Failed to delete user account." });
      }
    });

    // Purpose: Payment record delete kora
    app.delete("/payments/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };

        const result = await paymentsCollection.deleteOne(query);

        res.send(result);
      } catch (error) {
        console.error("Error deleting payment:", error);
        res.status(500).send({ message: "Failed to delete payment record." });
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

    // Purpose: Shudhu matro logged-in student-er successful payments fetch kora
    app.get("/payments/student", async (req, res) => {
      try {
        const studentEmail = req.query.email; // Query parameter theke student email nawa holo

        if (!studentEmail) {
          return res
            .status(400)
            .send({ message: "Student email is required for filtering." });
        }

        const query = { studentEmail: studentEmail };

        // paymentsCollection theke shudhu oi student-er payment gulo sort kore nawa holo
        const payments = await paymentsCollection
          .find(query)
          .sort({ paymentDate: -1 }) // Notun payment aage dekhabe
          .toArray();

        res.send(payments);
      } catch (error) {
        console.error("Error fetching student payments:", error);
        res.status(500).send({ message: "Failed to fetch payment history." });
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
    app.get("/tuition-posts", verifyFBToken, async (req, res) => {
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

    app.get("/all-applications/pending", async (req, res) => {
      try {
        // Shudhu 'status: "Pending"' application-gulo filter kora holo
        const query = { status: "Pending" };
        const pendingApplications = await applicationsCollection
          .find(query)
          .toArray();

        res.send(pendingApplications);
      } catch (error) {
        console.error("Error fetching pending applications:", error);
        res
          .status(500)
          .send({ message: "Failed to fetch pending applications." });
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

        const query = { _id: new ObjectId(id) };

        const updateDoc = {
          $set: {
            // Example fields to update:
            expectedSalary: updatedData.expectedSalary,
            qualifications: updatedData.qualifications,
            experience: updatedData.experience,
            // Onnyo fields jodi update koren
          },
        };

        const result = await applicationsCollection.updateOne(query, updateDoc);

        res.send({
          acknowledged: true,
          modifiedCount: result.modifiedCount,
          message: "Application successfully updated.",
        });
      } catch (error) {
        console.error("Error updating application:", error);
        res.status(500).send({ message: "Failed to update application." });
      }
    });

    //delte tutor data akhan theke
    app.delete("/applications/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };

        const result = await applicationsCollection.deleteOne(query);

        res.send({
          acknowledged: true,
          deletedCount: result.deletedCount,
          message: "Application successfully deleted.",
        });
      } catch (error) {
        console.error("Error deleting application:", error);
        res.status(500).send({ message: "Failed to delete application." });
      }
    });

    // Purpose: Logged-in user-er role hishebe shudhu 'Approved' applications fetch kora
    app.get("/ongoing-tuitions", async (req, res) => {
      try {
        const userEmail = req.query.email;
        const userRole = req.query.role; // Frontend theke user-er role pathano hobe

        if (!userEmail || !userRole) {
          return res
            .status(400)
            .send({ message: "User email and role are required." });
        }

        let query = {
          status: "Approved",
        };

        // User role onujayi query adjust kora
        if (userRole === "Student") {
          // Student: Application-ti je korechhe
          query.applicantEmail = userEmail;
        } else if (userRole === "Tutor") {
          // Tutor: Application-ti jake kora hoyechhe
          query.tutorEmail = userEmail;
        } else {
          // Admin ba onno role-er jonne sob ongoing application dekhano jete pare
          // kintu user role shudhu Student/Tutor-er jonne ei logic
          return res
            .status(403)
            .send({ message: "Access denied for this role." });
        }

        const ongoingApplications = await applicationsCollection
          .find(query)
          .toArray();

        res.send(ongoingApplications);
      } catch (error) {
        console.error("Error fetching ongoing tuitions:", error);
        res.status(500).send({ message: "Failed to fetch ongoing tuitions." });
      }
    });

    // Purpose: Tutor-er revenue history fetch kora
    app.get("/tutor-revenue-history", async (req, res) => {
      try {
        const tutorEmail = req.query.email;

        if (!tutorEmail) {
          return res.status(400).send({ message: "Tutor email is required." });
        }

        // Query: Shudhu sei payments gulo anbe, jekhane logged-in user (Tutor) receiver
        const query = { tutorEmail: tutorEmail };

        // 1. Payment History Fetch kora
        const payments = await paymentsCollection
          .find(query)
          .sort({ paymentDate: -1 })
          .toArray();

        // 2. Total Revenue Calculate kora
        let totalRevenue = 0;
        if (payments.length > 0) {
          totalRevenue = payments.reduce(
            (sum, payment) => sum + (payment.amount || 0),
            0
          );
        }

        res.send({
          totalRevenue: totalRevenue,
          paymentHistory: payments,
        });
      } catch (error) {
        console.error("Error fetching tutor payment history:", error);
        res.status(500).send({ message: "Failed to fetch payment data." });
      }
    });

    // ************** payment realeted api *****************
    app.post("/payments", async (req, res) => {
      try {
        const paymentData = req.body;
        const result = await paymentsCollection.insertOne(paymentData);
        res.status(201).send(result);
      } catch (error) {
        console.error("Error recording payment:", error);
        res.status(500).send({ message: "Failed to record payment." });
      }
    });

    app.get("/payments", verifyFBToken, async (req, res) => {
      const email = req.query.email;
      const query = {};

      // console.log( 'headers', req.headers);

      if (email) {
        query.customerEmail = email;

        // check email address
        if (email !== req.decoded_email) {
          return res.status(403).send({ message: "forbidden access" });
        }
      }
      const cursor = paymentCollection.find(query).sort({ paidAt: -1 });
      const result = await cursor.toArray();
      res.send(result);
    });

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
          tutorName: paymentInfo.tutorName,
        },

        customer_email: paymentInfo.tutorEmail,
        success_url: `${process.env.STRIPE_DOMAIN}/dashboard/student/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.STRIPE_DOMAIN}/dashboard/student/payment-cancelled`,
      });
      console.log(session);
      res.send({ url: session.url });
    });

    app.patch("/payment-success", async (req, res) => {
      // 1. Session ID check
      const sessionId = req.query.session_id;
      if (!sessionId) {
        return res.status(400).send({ message: "Missing session ID." });
      }

      try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);

        const transactionId = session.payment_intent;
        // const query = { transactionId: transactionId };

        // const existingPayment = await paymentsCollection.findOne(query);

        if (existingPayment) {
          return res.status(200).send({
            message: "Payment already processed.",
            transactionId: existingPayment.transactionId,
            trackingId: existingPayment.trackingId,
          });
        }

        // 2. Payment Status check
        if (session.payment_status !== "paid") {
          return res.status(400).send({ message: "Payment not completed." });
        }

        // --- Prepare Data ---
        const trackingId = generateTrackingId();
        const paymentData = {
          tutorEmail: session.metadata.tutorEmail,
          studentEmail: session.metadata.studentEmail,
          tuitionId: session.metadata.tuitionId,
          tutorName: session.metadata.tutorName || "N/A",
          amount: session.amount_total / 100,
          paymentDate: new Date(),
          transactionId: session.payment_intent,
          trackingId: trackingId,
        };

        // 3. Insert Payment Record (Shudhu Ekbar)
        const insertResult = await paymentsCollection.insertOne(paymentData);
        console.log("Payment Record Inserted:", insertResult.insertedId);

        // 4. Update Application Status (applicationsCollection)
        const query = { tuitionId: session.metadata.tuitionId };

        const updateDoc = {
          $set: {
            paymentStatus: "Paid",
            status: "Approved", // Application status Approved kora holo
            paymentDate: paymentData.paymentDate,
            trackingId: trackingId,
          },
        };
        const updateResult = await applicationsCollection.updateOne(
          query,
          updateDoc
        );
        console.log("Application Status Updated:", updateResult.modifiedCount);

        // 5. Success Response
        res.send({
          success: true,
          transactionId: paymentData.transactionId,
          trackingId: paymentData.trackingId,
        });
      } catch (error) {
        console.error("Error processing payment success:", error);
        res
          .status(500)
          .send({ message: "Server error during payment processing." });
      }
    });

    //student reject api here
    app.patch("/applications/reject/:id", async (req, res) => {
      try {
        // Application ID URL theke nawa holo
        const id = req.params.id;

        // Database query
        const query = { _id: new ObjectId(id) };

        // Update instruction: status ke "Rejected" set kora
        const updateDoc = {
          $set: {
            status: "Rejected",
          },
        };

        const result = await applicationsCollection.updateOne(query, updateDoc);

        // Client ke response pathano holo
        res.send({
          acknowledged: true,
          modifiedCount: result.modifiedCount,
          message: "Application status updated to Rejected",
        });
      } catch (error) {
        console.error("Error rejecting application:", error);
        res
          .status(500)
          .send({ message: "Failed to update application status." });
      }
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } finally {
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("e tuition aplication server is running???????");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
