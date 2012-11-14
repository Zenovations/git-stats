(function($) {
$(document).ready(function(){

   // fetch statistics
   $.getJSON('javascripts/katowulf-stats.json', function(data) {
      if( data && data.error && typeof(console) === 'object' && console.error ) {
         console.error(data.error);
      }
      else if( data ) {
         renderStats(data);
      }
   });


  // putting lines by the pre blocks
  $("pre").each(function(){
    var pre = $(this).text().split("\n");
    var lines = new Array(pre.length+1);
    for(var i = 0; i < pre.length; i++) {
      var wrap = Math.floor(pre[i].split("").length / 70);
      if (pre[i]==""&&i==pre.length-1) {
        lines.splice(i, 1);
      } else {
        lines[i] = i+1;
        for(var j = 0; j < wrap; j++) {
          lines[i] += "\n";
        }
      }
    }
    $(this).before("<pre class='lines'>" + lines.join("\n") + "</pre>");
  });

  var headings = [];

  var collectHeaders = function(){
    headings.push({"top":$(this).offset().top - 15,"text":$(this).text()});
  };

  if($(".markdown-body h1").length > 1) $(".markdown-body h1").each(collectHeaders)
  else if($(".markdown-body h2").length > 1) $(".markdown-body h2").each(collectHeaders)
  else if($(".markdown-body h3").length > 1) $(".markdown-body h3").each(collectHeaders)

  $(window).scroll(function(){
    if(headings.length==0) return true;
    var scrolltop = $(window).scrollTop() || 0;
    if(headings[0] && scrolltop < headings[0].top) {
      $(".current-section").css({"opacity":0,"visibility":"hidden"});
      return false;
    }
    $(".current-section").css({"opacity":1,"visibility":"visible"});
    for(var i in headings) {
      if(scrolltop >= headings[i].top) {
        $(".current-section .name").text(headings[i].text);
      }
    }
  });

  $(".current-section a").click(function(){
    $(window).scrollTop(0);
    return false;
  });


   function renderStats(data) {
      var startDate = firstDate(data.intervalKeys.days.slice(-120));
      var pointData = {
         pointInterval: 24 * 3600 * 1000,
         pointStart: startDate
      };

      renderStackedColumns({
         to: 'lineChart',
         title: 'Lines of code',
         series: [
            $.extend({ name: 'Deletes', data: nozeros(data.total.trends.deletes.days.slice(-120)), color: 'red'}, pointData ),
            $.extend({ name: 'Adds', data: nozeros(data.total.trends.adds.days.slice(-120)), color: 'blue'}, pointData )
         ]
      });

      renderScatter({
         title: 'Activity by Project',
         to: 'activityChart',
         categories: [''].concat(_.filter(_.keys(data.repos), function(k) { return hasNonZeros(data.repos[k].trends.commits.days); } )),
         series: repoCommitsInScatterFormat(data.repos, pointData, dateStamps(data.intervalKeys.days))
      });
   }

   function renderScatter(props) {
      new Highcharts.Chart({
         chart: {
            renderTo: props.to,
            type: 'scatter',
            spacingTop: 25
         },
         title: {
            text: '',
            align: 'left'
         },
         xAxis: {
            type: 'datetime',
            title: {
               text: null
            }
         },
         yAxis: {
            categories: props.categories,
            title: {
               text: props.title
            },
            min: 0
         },
         legend: {
            enabled: false
         },
         tooltip: {
            enabled: false
         },
         plotOptions: {
            scatter: {
               marker: {
                  fillOpacity:.5,
                  radius: 10,
                  symbol: 'circle'
               },
               states: {
                  hover: {
                     marker: {
                        enabled: false
                     }
                  }
               }
            }
         },
         series: props.series
      });
   }

   function renderStackedColumns(props) {
      new Highcharts.Chart({
         chart: {
            renderTo: props.to,
            type: 'column',
            zoomType: 'x'
         },
         title: {
            text: '',
            align: 'left'
         },
         xAxis: {
            type: 'datetime',
            title: {
               text: null
            }
         },
         yAxis: {
//            type: 'logarithmic',
//            minorTickInterval: 0.2,
            max: 2000,
            showFirstLabel: false,
            title: {
               text: props.title
            }
         },
         legend: {
            align: 'right',
            x: -100,
            verticalAlign: 'top',
            y: -5,
            floating: true,
            backgroundColor: (Highcharts.theme && Highcharts.theme.legendBackgroundColorSolid) || 'white',
            borderColor: '#CCC',
            borderWidth: 1,
            shadow: false
         },
         tooltip: {
            formatter: function() {
               return '<b>'+ moment(this.x).format('MM/DD') +'</b><br/>'+
                  this.series.name +': '+ this.y +'<br/>'+
                  'Total: '+ this.point.stackTotal;
            }
         },
         plotOptions: {
            column: {
               stacking: 'normal',
               dataLabels: {
                  enabled: false,
                  color: (Highcharts.theme && Highcharts.theme.dataLabelsColor) || 'white'
               }
            }
         },
         series: props.series
      });
   }

   function dateStamps(dateKeys) {
      var out = [];
      _.each(dateKeys, function(k) {
         out.push(moment.utc(k).valueOf());
      });
      return out;
   }

   function firstDate(dateKeys) {
      return moment.utc(dateKeys[0]).valueOf();
   }

   function nozeros(data) {
      return _.map(data, function(v) {
         return v <= 0? null : v;
      });
   }

   function repoCommitsInScatterFormat(repos, base, dates) {
      var out = [], i = 1;
      _.each(repos, function(repo, name) {
         hasNonZeros(repo.trends.commits.days) &&
         out.push($.extend({
            name: name,
            color: _nextColor(),
            data: scatterDetails(repo.trends.commits.days, i++, dates)
         }, base));
      });
      return out;
   }

   function scatterDetails(xdata, ypoint, dates) {
      var out = [];
      _.each(xdata, function(v, idx) {
         for(var i=0; i < v; i++) {
            out.push([dates[idx], ypoint]);
         }
      });
      return out;
   }

   function hasNonZeros(data) {
      return _.any(data, function(v) {
         return v > 0;
      })
   }

   var _nextColorCounter = 0;
   function _nextColor() {
      if( _nextColorCounter >= SCATTER_COLORS.length ) { _nextColorCounter = 0; }
      return SCATTER_COLORS[_nextColorCounter++];
   }

   function rgb(r, g, b) {
      return 'rgba('+r+','+g+','+b+','+OPACITY+')';
   }
   var OPACITY = '.2';

   var SCATTER_COLORS  = [
      rgb(163, 98, 0),
      rgb(101, 163, 0),
      rgb(0, 163, 60),
      rgb(0, 163, 144),
      rgb(0, 117, 163),
      rgb(0, 24, 163),
      rgb(65, 0, 163),
      rgb(147, 0, 163),
      rgb(163, 0, 109),
      rgb(163, 0, 35)
   ];

});
})(jQuery);