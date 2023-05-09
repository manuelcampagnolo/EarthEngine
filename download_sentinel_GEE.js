
////////////////////////////////////////////////
// author: Manuel Campagnolo mlc@isa.ulisboa.pt
// August 20, 2019
///////////////////////////////////////////////


// 

var lonmin=-8.63548;
var lonmax=-8.34998;
var latmin=37.18145;
var latmax=37.41591

var regiao = ee.Geometry.Polygon(
        [[[lonmin, latmin],
          [lonmax, latmin],
          [lonmax, latmax],
          [lonmin, latmax]]]); 


// determine centroid LONG and LAT
var LONG= ee.Number(regiao.centroid().coordinates().get(0)).getInfo(); // Retrieves the value of this object from the server.
var LAT = ee.Number(regiao.centroid().coordinates().get(1)).getInfo();
print(LONG,LAT);
Map.setCenter(LONG,LAT,16); // center image 


// output options
var band_to_download='B2';
var plot_map=0;
var plot_chart=0;
var create_video=0;
var save_to_drive=1;
// other options
var s2version='2A'; //1C available march2016 on for Portugal) or 2A (only available recently)
var date_start = '2018-07-15'; //'2016-01-01';
var now = Date.now();
var eeNow = ee.Date(now);
var date_end= eeNow; // 
var date_end='2022-07-30'; //download da imagem mais recentes da serie
//var date_end= ee.Date('2018-12-31');
var perc_nuvens=10;
var dias_para_tras=-120;
// label: version and location
var label = ee.String('S').cat(s2version).cat('-long-').cat(ee.Number(LONG).round().int()).cat('-lat-').cat(ee.Number(LAT).round().int()).getInfo();//mudar o nome para proba

// user defined  functions
// cloud masks
function filterS2_level2A(image) { // input: S2 image  Sentinel-2 MSI: MultiSpectral Instrument, Level-2A
  var SCL = image.select('SCL');
  var mask01 = ee.Image(0).where(
    SCL.lt(8)
   ,1);   //Put a 1 on good pixels
  return image.updateMask(mask01);
}  

function filterS2_level1C(image) { // input: Sentinel-2 MSI: MultiSpectral Instrument, Level-1C -- 2015-06-23T00:00:00 - Present
  var qa = image.select('QA60');
  
  // Bits 10 and 11 are clouds and cirrus, respectively.
  var cloudBitMask = 1 << 10;
  var cirrusBitMask = 1 << 11;
  
  // Both flags should be set to zero, indicating clear conditions.
  var mask01 = ee.Image(0).where(
    (qa.bitwiseAnd(cloudBitMask).eq(0)  //0: No opaque clouds
    .and(qa.bitwiseAnd(cirrusBitMask).eq(0))),  //0: No cirrus clouds
    1);   //Put a 1 on good pixels
  return image.updateMask(mask01);
} 

// add ndvi to image
function add_ndvi(image) {
  var ndvi=image.normalizedDifference(['B8','B4']);
  return image.addBands(ndvi.select([0],['ndvi']));
}

//////////////////////////////////////////// processing 

// apply cloud mask
// for Sentinel 2 MSI Surface Reflectance
if (s2version=='2A') 
{
  var S2 = ee.ImageCollection("COPERNICUS/S2_SR") // S2 version 2A (surface reflectance)
  .filterBounds(regiao)
  .filterDate(date_start,date_end); 
  
  var S2filtered= S2.map(filterS2_level2A); 
}

// for Sentinel-2 MSI TOA 
if (s2version=='1C') 
{
  var S2 = ee.ImageCollection('COPERNICUS/S2') //.filterDate('2015-06-23', date_end) // when S2 became available <<<<<<<<<  level 1-C
  .filterBounds(regiao)
  .filterDate(date_start,date_end); //ee.Date.fromYMD(year+1,12,31))
  
  var S2filtered= S2.map(filterS2_level1C); 

}

// compare image collection before and after cloud mask
print('S2',S2);
print('S2 filtered',S2filtered);

//////////////////////////////////////////////////////////////////////// create RGB map
// median temporal composite: RGB=432 
var rgbVis = { min: 0.0, max: 2500,  bands: ['B4', 'B3', 'B2']};
if (plot_map) Map.addLayer(S2filtered.filterDate(date_end.advance(dias_para_tras, 'day'),date_end).median(), rgbVis, 'RGB=432 median temporal composite');  //


// median temporal composite: RGB=843 
var rgbVis = { min: 0.0, max: [5000,2500,2500],  bands: ['B8', 'B4', 'B3']};
if (plot_map) Map.addLayer(S2filtered.filterDate(date_end.advance(dias_para_tras, 'day'),date_end).median(), rgbVis, 'RGB=843 mediano máscara nuvens');  //

///////////////////////////////////////////////////////////  create time series chart
// time series with (spatial) mean reducer
var main = {title: 'RED+NIR ', hAxis: {title: 'time'}, vAxis: {title: 'reflectance'}, };
if (plot_chart) print(ui.Chart.image.series(S2filtered.filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE',perc_nuvens)).select(['B4','B8']),regiao,ee.Reducer.mean(),10).setOptions(main));

var main = {title: 'NDVI ', hAxis: {title: 'Time'}, vAxis: {title: 'NDVI'}, };
if (plot_chart) print('ndvi',ui.Chart.image.series(S2filtered.filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE',perc_nuvens)).map(add_ndvi).select(["ndvi"]),regiao,ee.Reducer.mean(),10).setOptions(main));

/////////////////////////////////////////////////////////// export images to Google Drive
if (save_to_drive)
{
  // folder for output
  var folder = 'test-Theo';
  // determine spatial resolution from specific band
  var W = S2filtered.first().select('B8').projection().nominalScale().getInfo();
  print(W);
  
  /*
  // export first image from collection
  Export.image.toDrive({
          image: S2filtered.first().select(band_to_download),
          description: ee.String(label).cat('-').cat(band_to_download).cat('-').cat(year).cat('-').cat(month).cat('-').cat(day).getInfo(),
          folder: folder, 
          region: regiao,
          scale: W, 
          maxPixels: 1e13});
  */
  
  // To select any given image, image collection has to be converted into list first
  // Create list from image collection: sort by increasing date and collect the last 10
  // output: list where the first element is the most recent image 
  //var listS2ndvi = S2filtered.map(add_ndvi).sort("system:time_start",false).toList(10);
  var listS2ndvi = S2filtered.map(add_ndvi).sort("CLOUDY_PIXEL_PERCENTAGE",true).toList(10);
  
  print(ee.Image(listS2ndvi));
  print(ee.Image(listS2ndvi.get(0)));
  
  // choose one image with get and extract its date
  //var img = ee.Image(listS2ndvi.get(2)).select('ndvi'); // get second most recent image from collection
  var img = ee.Image(listS2ndvi.get(0)).select(band_to_download); // get first most recent image from collection
  var imgdate = ee.Date(img.get("system:time_start"));
  // extract year, month and day from date
  var year = imgdate.get('year');
  var month = imgdate.get('month');
  var day = imgdate.get('day');
  var newlabel = ee.String(label).cat('-').cat(band_to_download).cat('-').cat(year).cat('-').cat(month).cat('-').cat(day).getInfo();
         
  // export
  Export.image.toDrive({
          image: img,
          description: newlabel,
          folder: folder, 
          region: regiao,
          scale: W, 
          maxPixels: 1e13});
  
}

/////////////////////////////////////////////////////////// create and output video
if (create_video)
{
  // create video RGB=843 -- using S2 so one can see clouds
  // Make it a 8 bit format.
  var coll4Video = S2
    .map(function(image){
    return image.visualize({bands: ['B8', 'B4', 'B3'], min:0.0 ,max: [5000,2500,2500]});  //.select(['B4','B3','B2'])
    // Need to make the data 3 bands at 8-bit.
    //.map(function(image) { return image.multiply(512).uint8();
    });
    
  print(coll4Video);
  var nomeVideo = ee.String(label).cat("-RGB843-5m").getInfo(); 
  
  //Export the video to your drive
  Export.video.toDrive({
      collection: coll4Video,
      description: nomeVideo,
      folder: 'videos',
      scale: 5,
      //dimensions: 1080,
      framesPerSecond: 1,
      region: regiao,
      maxPixels : 1e10
  });
}

/////////////////////////////////////////////////////// run multiple tasks
// https://groups.google.com/forum/#!msg/google-earth-engine-developers/-MMukxVsRJI/bvx1zXKCBwAJ
/*  F12 + 'allow pasting' e escrver na linha de comandos :

function runTaskList() {
	    //1. task local type-EXPORT_FEATURES awaiting-user-config
	    //2. task local type-EXPORT_IMAGE awaiting-user-config
	    var tasklist = document.getElementsByClassName('awaiting-user-config');
	    for (var i = 0; i < tasklist.length; i++)
	        tasklist[i].children[2].click();
	}
	// confirmAll();
	function confirmAll() {
	    var ok = document.getElementsByClassName('goog-buttonset-default goog-buttonset-action');
	    for (var i = 0; i < ok.length; i++)
	        ok[i].click();
	}
	
	runTaskList();
	confirmAll();
*/
