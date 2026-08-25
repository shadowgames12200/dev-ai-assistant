import axios from "axios";

async function testLogin() {
  const url = "http://localhost:3000/api/auth/login";
  const identifier = process.env.LOGIN_IDENTIFIER;
  const password = process.env.LOGIN_PASSWORD;

  if (!identifier || !password) {
    throw new Error("LOGIN_IDENTIFIER and LOGIN_PASSWORD are required to run this test.");
  }

  const payload = { identifier, password };

  console.log("Testing login at:", url);
  try {
    const response = await axios.post(url, payload);
    console.log("Login Success!");
    console.log("Response:", JSON.stringify(response.data, null, 2));
    console.log("Cookies:", response.headers["set-cookie"]);
  } catch (error: any) {
    console.error("Login Failed!");
    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("Data:", JSON.stringify(error.response.data, null, 2));
    } else {
      console.error("Error:", error.message);
    }
  }
}

testLogin();
