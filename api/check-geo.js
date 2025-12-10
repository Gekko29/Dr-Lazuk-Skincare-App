export default async function handler(req, res) {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = forwarded ? forwarded.split(',')[0] : req.connection.remoteAddress;
  
  try {
    // Use ipapi.co for free IP geolocation
    const response = await fetch(`https://ipapi.co/${ip}/json/`);
    const data = await response.json();
    
    const isUS = data.country_code === 'US';
    
    res.status(200).json({ isUS, country: data.country_code });
  } catch (error) {
    // Default to allowing if check fails
    res.status(200).json({ isUS: true, country: 'unknown' });
  }
}
