import axios from "axios";

async function testLogin() {
  const url = "http://localhost:3000/api/auth/login";
  const payload = {
    identifier: "charleshenriquegonsalves05@gmail.com",
    password: "963850"
  };

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
