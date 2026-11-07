export default async (request) => {
   console.log("ok");

   return Response.json({
      success: true,
      message: "Hello from Netlify!",
      method: request.method,
      timestamp: new Date().toISOString(),
   });
};
